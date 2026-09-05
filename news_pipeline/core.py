import hashlib
import json
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import requests
import truststore
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .parser import VERSION as PARSER_VERSION, parse_news

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'bitcoin iris/dataset/kategori/textual_news/watcher_guru_articles.jsonl'
LABELS = ['negative', 'neutral', 'positive']


def now():
    return datetime.now(timezone.utc).isoformat()


def timestamp(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except (ValueError, TypeError):
        return None


def clean(text):
    text = re.sub(r'https?://\S+|@\w+', ' ', text)
    text = re.sub(r'^(?:JUST IN|BREAKING|JUST ANNOUNCED)\s*:', '', text.strip(), flags=re.I)
    return re.sub(r'\s+', ' ', text).strip()


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def training_rows(path):
    rows, audit = [], {'input': 0, 'invalid_timestamp': 0, 'empty': 0, 'missing_label': 0, 'duplicates': 0}
    with Path(path).open(encoding='utf-8') as handle:
        for line in handle:
            record = json.loads(line)
            audit['input'] += 1
            date = timestamp(record.get('published_at'))
            text = clean(record.get('raw_text', ''))
            if date is None:
                audit['invalid_timestamp'] += 1
                continue
            if not text:
                audit['empty'] += 1
                continue
            polarity = record.get('assessment', {}).get('result', {}).get('sentiment', {}).get('polarity')
            if not isinstance(polarity, (int, float)) or not -1 <= polarity <= 1:
                audit['missing_label'] += 1
                continue
            label = 'negative' if polarity < 0 else 'positive' if polarity > 0 else 'neutral'
            rows.append({'date': date, 'text': text, 'label': label, 'source_id': record['source_id']})
    seen_text, seen_post, unique = set(), set(), []
    for row in sorted(rows, key=lambda row: row['date']):
        key = digest(row['text'].casefold())
        if key in seen_text or row['source_id'] in seen_post:
            audit['duplicates'] += 1
            continue
        seen_text.add(key)
        seen_post.add(row['source_id'])
        unique.append(row)
    audit['retained'] = len(unique)
    return unique, audit


def temporal_split(rows):
    days = sorted({row['date'].date() for row in rows})
    if len(days) < 10:
        raise ValueError('Need at least 10 distinct publication days.')
    validation_start, test_start = days[int(len(days) * .7)], days[int(len(days) * .85)]
    train = [r for r in rows if r['date'].date() < validation_start]
    validation = [r for r in rows if validation_start <= r['date'].date() < test_start]
    test = [r for r in rows if r['date'].date() >= test_start]
    return train, validation, test


def parse_telegram(html):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    for message in soup.select('.tgme_widget_message[data-post]'):
        post = message.get('data-post', '')
        text_node = message.select_one('.tgme_widget_message_text')
        time_node = message.select_one('time[datetime]')
        if not re.fullmatch(r'WatcherGuru/\d+', post, flags=re.I) or text_node is None:
            continue
        for br in text_node.find_all('br'):
            br.replace_with('\n')
        raw = text_node.get_text('', strip=False).strip()
        if not clean(raw):
            continue
        date = timestamp(time_node.get('datetime')) if time_node else None
        records.append({'source': 'watcher_guru', 'source_id': post.split('/')[-1],
                        'url': f'https://t.me/{post}', 'raw_text': raw,
                        'published_at': date.isoformat() if date else None,
                        'observed_at': now(), 'collection_mode': 'live_poll'})
    if not records:
        raise ValueError('No textual posts parsed: source unavailable or HTML structure changed.')
    return records


def fetch_latest():
    # Use the OS certificate store, including locally trusted proxy CAs.
    truststore.inject_into_ssl()
    with requests.Session() as session:
        retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
        session.mount('https://', HTTPAdapter(max_retries=retry))
        response = session.get('https://t.me/s/WatcherGuru', timeout=(10, 30))
        response.raise_for_status()
        return parse_telegram(response.text)


def classify(bundle, record):
    text = clean(record['raw_text'])
    probabilities = bundle['pipeline'].predict_proba([text])[0]
    classes = bundle['pipeline'].classes_
    scores = {str(label): float(probability) for label, probability in zip(classes, probabilities)}
    prediction = max(scores, key=scores.get)
    semantic = parse_news(record['raw_text'])
    return {**record, 'cleaned_text': text, 'content_hash': digest(record['raw_text']),
            'semantic_parse': semantic,
            'sentiment': prediction, 'probabilities': scores,
            'needs_review': scores[prediction] < 0.6 or semantic['needs_review'],
            'explicit_btc_mention': bool(re.search(r'\b(?:bitcoin|btc)\b', text, re.I)),
            'model_id': bundle['model_id'], 'label_basis': 'heuristic_teacher',
            'classified_at': now()}


def ingest(bundle, records, database):
    Path(database).parent.mkdir(parents=True, exist_ok=True)
    inserted = 0
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute('''CREATE TABLE IF NOT EXISTS predictions (
            source TEXT, source_id TEXT, content_hash TEXT, payload TEXT,
            PRIMARY KEY(source, source_id, content_hash))''')
        for record in records:
            key = digest(record['raw_text'])
            exists = connection.execute('SELECT payload FROM predictions WHERE source=? AND source_id=? AND content_hash=?',
                                        (record['source'], record['source_id'], key)).fetchone()
            if not exists:
                legacy_key = digest(clean(record['raw_text']))
                legacy = connection.execute('SELECT payload FROM predictions WHERE source=? AND source_id=? AND content_hash=?',
                                            (record['source'], record['source_id'], legacy_key)).fetchone()
                if legacy and json.loads(legacy[0])['raw_text'] == record['raw_text']:
                    connection.execute('UPDATE predictions SET content_hash=? WHERE source=? AND source_id=? AND content_hash=?',
                                       (key, record['source'], record['source_id'], legacy_key))
                    exists = legacy
            if exists:
                payload = json.loads(exists[0])
                if payload.get('semantic_parse', {}).get('parser_version') != PARSER_VERSION:
                    payload['semantic_parse'] = parse_news(payload['raw_text'])
                    payload['content_hash'] = key
                    payload['needs_review'] = max(payload['probabilities'].values()) < .6 or payload['semantic_parse']['needs_review']
                    connection.execute('UPDATE predictions SET payload=? WHERE source=? AND source_id=? AND content_hash=?',
                                       (json.dumps(payload, ensure_ascii=False), record['source'], record['source_id'], key))
                continue
            result = classify(bundle, record)
            connection.execute('INSERT INTO predictions VALUES (?, ?, ?, ?)',
                               (record['source'], record['source_id'], key, json.dumps(result, ensure_ascii=False)))
            inserted += 1
    return inserted
