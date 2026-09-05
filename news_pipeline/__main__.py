import argparse
import csv
import json
import logging
import sqlite3
import time
from collections import Counter
from contextlib import closing
from pathlib import Path

from .core import DATA, LABELS, classify, digest, fetch_latest, ingest, now, temporal_split, training_rows
from .parser import parse_news


def train(args):
    from .exports import safe_csv_text
    import joblib
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report, f1_score
    from sklearn.pipeline import make_pipeline
    rows, audit = training_rows(args.data)
    train_rows, validation, test = temporal_split(rows)
    if set(r['label'] for r in train_rows) != set(LABELS):
        raise ValueError('Training partition must contain all three sentiment classes.')
    x, y = [r['text'] for r in train_rows], [r['label'] for r in train_rows]
    candidates = []
    best = None
    for c in [.5, 2.0, 8.0]:
        pipeline = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=40000, sublinear_tf=True),
                                 LogisticRegression(C=c, class_weight='balanced', max_iter=1000, random_state=42))
        pipeline.fit(x, y)
        predicted = pipeline.predict([r['text'] for r in validation])
        score = f1_score([r['label'] for r in validation], predicted, labels=LABELS, average='macro', zero_division=0)
        candidates.append({'C': c, 'validation_macro_f1': score})
        if best is None or score > best[0]:
            best = (score, pipeline, c)
    pipeline = best[1]
    test_labels = [r['label'] for r in test]
    predicted = pipeline.predict([r['text'] for r in test])
    majority = Counter(y).most_common(1)[0][0]
    report = {'created_at': now(), 'evaluation_basis': 'agreement with heuristic labels; not human accuracy or price impact',
              'audit': audit, 'split': {name: {'count': len(part), 'start': part[0]['date'].isoformat(),
                                           'end': part[-1]['date'].isoformat(), 'labels': dict(Counter(r['label'] for r in part))}
                                      for name, part in [('train', train_rows), ('validation', validation), ('test', test)]},
              'candidates': candidates, 'selected_C': best[2],
              'test': classification_report(test_labels, predicted, labels=LABELS, output_dict=True, zero_division=0),
              'majority_test_macro_f1': f1_score(test_labels, [majority] * len(test), labels=LABELS, average='macro', zero_division=0)}
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    model_id = 'tfidf-logreg-' + digest(Path(args.data).read_text(encoding='utf-8') + str(best[2]))[:12]
    joblib.dump({'pipeline': pipeline, 'model_id': model_id, 'trained_through': train_rows[-1]['date'].isoformat()}, output / 'model.joblib')
    (output / 'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    with (output / 'test_predictions.csv').open('w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow(['source_id', 'published_at', 'text', 'weak_label', 'prediction'])
        writer.writerows((safe_csv_text(r['source_id']), r['date'].isoformat(), safe_csv_text(r['text']), r['label'], p) for r, p in zip(test, predicted))
    print(json.dumps({'audit': audit, 'test_macro_f1': report['test']['macro avg']['f1-score'],
                      'majority_macro_f1': report['majority_test_macro_f1'], 'output': str(output)}, indent=2))


def main():
    parser = argparse.ArgumentParser(description='IRIS news sentiment pipeline')
    sub = parser.add_subparsers(dest='command', required=True)
    data = sub.add_parser('data', help='Durable parser-only data pipeline; never loads joblib')
    data.add_argument('action', choices=['import', 'collect', 'process', 'requeue', 'run', 'status', 'export', 'daily'])
    data.add_argument('--database', default='artifacts/news/data.sqlite')
    data.add_argument('--input', type=Path)
    data.add_argument('--output', type=Path)
    data.add_argument('--as-of')
    data.add_argument('--time-basis', choices=['ready', 'publication'], default='ready')
    data.add_argument('--max-pages', type=int, default=5)
    data.add_argument('--limit', type=int, default=1000)
    data.add_argument('--retry', action='store_true')
    data.add_argument('--watch', action='store_true')
    data.add_argument('--interval', type=int, default=60)
    parse = sub.add_parser('parse', help='Parse text or JSONL without a sentiment model')
    source = parse.add_mutually_exclusive_group(required=True)
    source.add_argument('--text')
    source.add_argument('--input', type=Path)
    parse.add_argument('--output', type=Path)
    fit = sub.add_parser('train')
    fit.add_argument('--data', default=str(DATA))
    fit.add_argument('--output', default='artifacts/news')
    for name in ['predict', 'poll']:
        command = sub.add_parser(name)
        command.add_argument('--model', default='artifacts/news/model.joblib')
        if name == 'predict':
            command.add_argument('--text', required=True)
        else:
            command.add_argument('--database', default='artifacts/news/live.sqlite')
            command.add_argument('--watch', action='store_true')
            command.add_argument('--interval', type=int, default=60)
    export = sub.add_parser('export')
    export.add_argument('--database', default='artifacts/news/live.sqlite')
    export.add_argument('--output', default='artifacts/news/live_predictions.jsonl')
    args = parser.parse_args()
    if args.command == 'data':
        from .collector import collect
        from .exports import export_data
        from .storage import import_jsonl, process_pending, requeue_failed, status
        if args.watch and args.action != 'run':
            parser.error('--watch requires data run')
        if args.interval < 30:
            parser.error('interval must be at least 30 seconds')
        if args.action == 'import':
            if not args.input:
                parser.error('import requires --input')
            print(json.dumps(import_jsonl(args.input, args.database)))
        elif args.action in {'export', 'daily'}:
            if not args.output or not args.as_of:
                parser.error('export/daily require --output and --as-of')
            print(json.dumps(export_data(args.database, args.output, args.as_of,
                                         args.action == 'daily', args.time_basis)))
        elif args.action == 'status':
            print(json.dumps(status(args.database), indent=2))
        elif args.action == 'requeue':
            print(json.dumps(requeue_failed(args.database)))
        elif args.action == 'process':
            print(json.dumps(process_pending(args.database, args.limit, args.retry)))
        else:
            while True:
                try:
                    result = {'collection': collect(args.database, args.max_pages)}
                    if args.action == 'run':
                        result['processing'] = process_pending(args.database, args.limit, args.retry)
                    print(json.dumps(result), flush=True)
                except Exception:
                    if not args.watch:
                        raise
                    logging.exception('Collection failed; cursor retained for next attempt')
                    # Existing inbox work can still finish during a source outage.
                    print(json.dumps({'processing': process_pending(args.database, args.limit, args.retry)}), flush=True)
                if not args.watch:
                    break
                time.sleep(args.interval)
    elif args.command == 'parse':
        if args.text is not None:
            result = json.dumps(parse_news(args.text), ensure_ascii=False, indent=2)
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(result + '\n', encoding='utf-8')
            else:
                print(result)
        else:
            if not args.output:
                parser.error('--input requires --output')
            if args.input.resolve() == args.output.resolve():
                parser.error('Input and output must differ; preserve source records.')
            args.output.parent.mkdir(parents=True, exist_ok=True)
            # Exclusive creation avoids silently overwriting a previous dataset/export.
            with args.input.open(encoding='utf-8') as source, args.output.open('x', encoding='utf-8') as dest:
                count = 0
                for count, line in enumerate(source, 1):
                    record = json.loads(line)
                    record['semantic_parse'] = parse_news(record['raw_text'])
                    dest.write(json.dumps(record, ensure_ascii=False) + '\n')
            print(json.dumps({'parsed': count, 'output': str(args.output)}))
    elif args.command == 'train':
        train(args)
    elif args.command == 'export':
        if not Path(args.database).is_file():
            parser.error('Database does not exist; run poll first.')
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(args.database)) as connection, open(args.output, 'w', encoding='utf-8') as handle:
            for (payload,) in connection.execute('SELECT payload FROM predictions ORDER BY source, CAST(source_id AS INTEGER), rowid'):
                handle.write(payload + '\n')
        print(args.output)
    else:
        import joblib
        bundle = joblib.load(args.model)
        if args.command == 'predict':
            if not args.text.strip():
                parser.error('Text must not be empty.')
            print(json.dumps(classify(bundle, {'raw_text': args.text}), indent=2, ensure_ascii=False))
        else:
            if args.interval < 30:
                parser.error('Polling interval must be at least 30 seconds.')
            while True:
                try:
                    records = fetch_latest()
                    inserted = ingest(bundle, records, args.database)
                    print(json.dumps({'at': now(), 'fetched': len(records), 'inserted': inserted}), flush=True)
                except Exception:
                    if not args.watch:
                        raise
                    logging.exception('Poll failed; retrying next interval')
                if not args.watch:
                    break
                time.sleep(args.interval)


if __name__ == '__main__':
    main()
