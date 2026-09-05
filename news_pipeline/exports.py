"""As-of exports. Daily CSV contains numbers/dates only, never source text."""
import csv
import json
from collections import defaultdict
from pathlib import Path

from .parser import VERSION
from .storage import connect, date
from .weighting import weight_post


def safe_csv_text(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) or text.startswith(('\t', '\r', '\n')) else text


def export_data(database, output, as_of, daily=False, time_basis='ready'):
    cutoff = date(as_of)
    if cutoff is None:
        raise ValueError('as_of requires an ISO timestamp with timezone')
    if time_basis not in {'ready', 'publication'}:
        raise ValueError('invalid time basis')
    if Path(database).resolve() == Path(output).resolve():
        raise ValueError('output must not overwrite database')
    with connect(database) as db:
        candidates = db.execute('''SELECT r.id,r.source_id,r.text_hash,r.observed_at,p.payload
            FROM raw_posts r JOIN parsed_posts p ON r.id=p.raw_id WHERE p.parser_version=?
            ORDER BY r.id''', (VERSION,)).fetchall()
        selected = {}
        for row in candidates:
            payload = json.loads(row['payload'])
            available = date(payload['feature_ready_at'] if time_basis == 'ready' else payload['published_at'])
            if available is None or available > cutoff:
                continue
            # One known version per post at the requested cutoff. Publication mode is retrospective.
            key = (row['source_id'], available.date()) if daily else row['source_id']
            selected[key] = (available, row, payload)
        ordered = sorted(selected.values(), key=lambda item: (item[0], item[1]['id']))
        seen, records = set(), []
        for available, row, payload in ordered:
            duplicate = row['text_hash'] in seen
            seen.add(row['text_hash'])
            payload['weighting'] = weight_post(payload['semantic_parse'], payload['published_at'], cutoff, duplicate)
            payload['export'] = {'as_of': cutoff.isoformat(), 'time_basis': time_basis,
                                 'available_at': available.isoformat(), 'exact_duplicate': duplicate,
                                 'retrospective': time_basis == 'publication'}
            records.append(payload)
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    with Path(output).open('x', encoding='utf-8', newline='') as dest:
        if not daily:
            for record in records:
                dest.write(json.dumps(record, ensure_ascii=False) + '\n')
        else:
            groups = defaultdict(lambda: dict(posts=0, unique_texts=0, btc_mentions=0,
                                             supported_events=0, review_posts=0, weight_sum=0.0))
            for record in records:
                group = groups[record['export']['available_at'][:10]]
                group['posts'] += 1
                if record['export']['exact_duplicate']:
                    continue
                p = record['semantic_parse']
                group['unique_texts'] += 1
                group['btc_mentions'] += p['btc_relevance'] == 'explicit_mention'
                group['supported_events'] += len(p['events'])
                group['review_posts'] += p['needs_review']
                # Daily weights are evaluated at day-end, capped by the requested cutoff.
                end = date(record['export']['available_at'][:10] + 'T23:59:59.999999+00:00')
                group['weight_sum'] += weight_post(p, record['published_at'], min(end, cutoff))['post_weight']
            writer = csv.DictWriter(dest, fieldnames=['date', 'posts', 'unique_texts', 'btc_mentions',
                                                      'supported_events', 'review_posts', 'weight_sum',
                                                      'time_basis', 'coverage', 'as_of', 'parser_version'])
            writer.writeheader()
            for day, group in sorted(groups.items()):
                writer.writerow({'date': day, **group, 'time_basis': time_basis, 'coverage': 'unknown',
                                 'as_of': cutoff.isoformat(), 'parser_version': VERSION})
    return {'exported': len(records), 'output': str(output), 'time_basis': time_basis}
