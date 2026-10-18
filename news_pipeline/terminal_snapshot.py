"""Publish news with the pipeline's semantic evidence and ranking weights."""
import argparse
import json
import os
import sys
import logging
import re
import unicodedata
import tempfile
from datetime import timedelta
from pathlib import Path

from .core import ROOT, clean, now, timestamp
from .parser import VERSION
from .storage import connect, writer_lock
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
    if current.get('origin') == 'durable_store':
        document['origin'] = 'durable_store'
        document['source_health'] = current.get('source_health', {})
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
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=output.parent,
                                     prefix=output.name + '.', suffix='.tmp', delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(document, handle, ensure_ascii=False)
    try:
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return len(document['records'])



def publish_database(database, output):
    """The terminal projection is rebuilt only from canonical, processed records.

    No previous snapshot merge: stale exports cannot resurrect superseded records.
    Lock spans both the database read and publication to serialize projections.
    """
    if Path(database).resolve() == Path(output).resolve():
        raise ValueError('Snapshot output must not overwrite the canonical database')
    if not Path(database).is_file():
        raise FileNotFoundError('Canonical database missing; run data import or data run first')
    with writer_lock(database):
        with connect(database) as db:
            cutoff = (timestamp(now()) - timedelta(days=30)).isoformat()
            records = [json.loads(row[0]) for row in db.execute(
                """SELECT p.payload FROM raw_posts r JOIN parsed_posts p ON p.raw_id=r.id
                   WHERE p.parser_version=? AND r.published_at>=? AND r.id=(
                       SELECT MAX(latest.id) FROM raw_posts latest WHERE latest.source_id=r.source_id)
                   ORDER BY r.published_at DESC LIMIT 2000""", (VERSION, cutoff))]
            health_row = db.execute("SELECT payload FROM source_health WHERE source='watcher_guru'").fetchone()
            health = json.loads(health_row[0]) if health_row else {}
        return publish(Path(output), records, {'origin': 'durable_store', 'source_health': health,
                       'attempted_at': health.get('attempted_at'), 'fetched_at': health.get('fetched_at')})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / 'artifacts/news/data.sqlite')
    parser.add_argument('--live', action='store_true', help='Collect and process through the canonical store before publishing')
    parser.add_argument('--output', type=Path, default=ROOT / 'terminal/.data/watcher-guru.json')
    args = parser.parse_args()
    if args.live:
        from .collector import collect
        from .storage import process_pending
        try:
            collect(args.database)
            process_pending(args.database)
        finally:
            # Publish failed attempt health without inventing a new fetch success.
            original_error = sys.exc_info()[0]
            try:
                publish_database(args.database, args.output)
            except Exception:
                if original_error is None:
                    raise
                logging.exception('Snapshot publication failed; canonical data retained')
    else:
        publish_database(args.database, args.output)
    print(json.dumps({'output': str(args.output)}))


if __name__ == '__main__':
    main()
