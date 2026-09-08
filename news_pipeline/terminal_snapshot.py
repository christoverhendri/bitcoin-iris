"""Publish news with the pipeline's semantic evidence and ranking weights."""
import argparse
import json
import os
import re
import unicodedata
from datetime import timedelta
from pathlib import Path

from .core import DATA, ROOT, clean, fetch_latest, now, timestamp
from .parser import parse_news
from .weighting import weight_post


def publish(output, incoming, current=None):
    current = current or {}
    as_of = timestamp(now())
    cutoff = as_of - timedelta(days=30)
    entries = {}
    for record in [*current.get('records', []), *incoming]:
        if not isinstance(record, dict):
            continue
        source_id = record.get('source_id', '')
        published = timestamp(record['published_at']) if isinstance(record.get('published_at'), str) else None
        text = record.get('raw_text')
        if not isinstance(source_id, str) or not re.fullmatch(r'[1-9][0-9]{0,17}', source_id):
            continue
        if not isinstance(text, str) or not text.strip() or not published or not cutoff <= published <= as_of:
            continue
        # Parse original text: evidence offsets must survive display cleaning.
        # Recompute imported assessments with the installed parser version.
        try:
            parsed = parse_news(text)
        except ValueError:
            continue
        entries[source_id] = {'source_id': source_id, 'raw_text': text, 'display_text': clean(text),
                              'published_at': published.isoformat(), 'semantic_parse': parsed}
        for key in ('observed_at', 'feature_ready_at', 'collection_mode', 'content_hash'):
            if isinstance(record.get(key), str):
                entries[source_id][key] = record[key]
    records = sorted(entries.values(), key=lambda r: r['published_at'], reverse=True)[:2000]
    seen = set()
    for record in reversed(records):
        normalized = re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', record['raw_text'])).strip().casefold()
        record['weighting'] = weight_post(record['semantic_parse'], record['published_at'], as_of, normalized in seen)
        seen.add(normalized)
    document = {'version': 2, 'generated_at': as_of.isoformat(), 'records': []}
    for key in ('attempted_at', 'fetched_at'):
        if isinstance(current.get(key), str) and timestamp(current[key]):
            document[key] = current[key]
    # Semantic evidence is larger than headline-only snapshots. Keep newest rows
    # within the reader's 40 MiB budget rather than making the whole feed fail.
    size = len(json.dumps(document, ensure_ascii=False).encode('utf-8'))
    for record in records:
        size += len(json.dumps(record, ensure_ascii=False).encode('utf-8')) + 2
        if size > 40 * 1024 * 1024:
            break
        document['records'].append(record)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(document, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, output)
    return len(document['records'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=DATA)
    parser.add_argument('--live', action='store_true', help='Fetch latest public page once; five-minute cooldown')
    parser.add_argument('--output', type=Path, default=ROOT / 'terminal/.data/watcher-guru.json')
    args = parser.parse_args()
    current = json.loads(args.output.read_text(encoding='utf-8')) if args.output.exists() else {}
    if args.live:
        previous = timestamp(current.get('attempted_at'))
        if previous and timestamp(now()) - previous < timedelta(minutes=5):
            parser.error('Watcher.Guru GET cooldown: wait five minutes between attempts.')
        # Persist the attempt before fetching so failures also respect the cooldown.
        current['attempted_at'] = now()
        publish(args.output, [], current)
        incoming = fetch_latest()
        current['fetched_at'] = now()
    else:
        with args.input.open(encoding='utf-8') as handle:
            incoming = [json.loads(line) for line in handle if line.strip()]
    print(json.dumps({'items': publish(args.output, incoming, current), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
