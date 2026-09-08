"""Durable inbox: raw commit first, derived processing second. Single worker."""
import hashlib
import json
import re
import sqlite3
import unicodedata
import functools
import inspect
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .parser import MAX_TEXT_CHARS, VERSION, parse_news
from .weighting import weight_post

MAX_RECORD_BYTES = 256 * 1024
MAX_DATABASE_BYTES = 512 * 1024 * 1024


@contextmanager
def writer_lock(database):
    path = Path(str(Path(database).resolve()) + '.writer.lock')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeError('Another data pipeline writer is active for this database') from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def exclusive_writer(function):
    @functools.wraps(function)
    def wrapped(*args, **kwargs):
        database = inspect.signature(function).bind(*args, **kwargs).arguments['database']
        with writer_lock(database):
            return function(*args, **kwargs)
    return wrapped


def utcnow():
    return datetime.now(timezone.utc)


def hash_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def date(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


@contextmanager
def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS raw_posts (
            id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, content_hash TEXT NOT NULL,
            text_hash TEXT NOT NULL, raw_text TEXT NOT NULL, published_at TEXT,
            observed_at TEXT NOT NULL, collection_mode TEXT NOT NULL, raw_payload TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            error TEXT, UNIQUE(source_id,content_hash));
        CREATE TABLE IF NOT EXISTS parsed_posts (
            raw_id INTEGER NOT NULL REFERENCES raw_posts(id), parser_version TEXT NOT NULL,
            processed_at TEXT NOT NULL, payload TEXT NOT NULL,
            PRIMARY KEY(raw_id,parser_version));
        CREATE TABLE IF NOT EXISTS quarantine (
            fingerprint TEXT PRIMARY KEY, reason TEXT NOT NULL, sample TEXT NOT NULL,
            created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS checkpoints (name TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS source_health (source TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS fetch_pages (
            id INTEGER PRIMARY KEY, before_id INTEGER, observed_at TEXT NOT NULL,
            html TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT);
        CREATE INDEX IF NOT EXISTS raw_state ON raw_posts(state,id);
        ''')
        yield db
    finally:
        db.close()


def quarantine(db, payload, reason):
    ensure_capacity(db)
    db.execute('INSERT OR IGNORE INTO quarantine VALUES (?,?,?,?)',
               (hash_text(payload), reason, payload[:2048], utcnow().isoformat()))


def ensure_capacity(db):
    size = db.execute('PRAGMA page_count').fetchone()[0] * db.execute('PRAGMA page_size').fetchone()[0]
    if size >= MAX_DATABASE_BYTES:
        raise RuntimeError('Database reached 512 MiB budget; archive it before continuing')


def save_record(db, record, observed_at=None, mode='import'):
    """Only trusted caller supplies observed_at/mode; imported scores are ignored."""
    ensure_capacity(db)
    payload = json.dumps(record, ensure_ascii=False, allow_nan=False)
    try:
        if not isinstance(record, dict):
            raise ValueError('record_not_object')
        if len(payload.encode('utf-8')) > MAX_RECORD_BYTES:
            raise ValueError('record_too_large')
        source_id = record.get('source_id')
        if not isinstance(source_id, str) or not re.fullmatch(r'[1-9][0-9]{0,17}', source_id):
            raise ValueError('invalid_source_id')
        if record.get('source') != 'watcher_guru':
            raise ValueError('invalid_source')
        text = record.get('raw_text')
        if not isinstance(text, str) or not text.strip():
            raise ValueError('empty_or_invalid_text')
        if len(text) > MAX_TEXT_CHARS:
            raise ValueError('text_too_large')
        if any(unicodedata.category(c) == 'Cc' and c not in '\n\r\t' for c in text):
            raise ValueError('control_character')
        if re.search('[\u202a-\u202e\u2066-\u2069]', text):
            raise ValueError('direction_override_character')
        observed = observed_at or utcnow()
        if observed.tzinfo is None:
            raise ValueError('invalid_observation_time')
        published = date(record.get('published_at'))
        if record.get('published_at') is not None and published is None:
            raise ValueError('invalid_publication_time')
        if published and (published < datetime(2009, 1, 1, tzinfo=timezone.utc) or published > observed + timedelta(minutes=5)):
            raise ValueError('publication_time_out_of_range')
        normalized = re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text)).strip().casefold()
        version_hash = hash_text(json.dumps([text, published.isoformat() if published else None]))
        cursor = db.execute('''INSERT OR IGNORE INTO raw_posts
            (source_id,content_hash,text_hash,raw_text,published_at,observed_at,collection_mode,raw_payload)
            VALUES (?,?,?,?,?,?,?,?)''',
            (source_id, version_hash, hash_text(normalized), text, published.isoformat() if published else None,
             observed.isoformat(), mode, payload))
        return 'inserted' if cursor.rowcount else 'duplicate'
    except ValueError as exc:
        quarantine(db, payload, str(exc))
        return 'quarantined'


@exclusive_writer
def import_jsonl(path, database):
    counts = dict(inserted=0, duplicate=0, quarantined=0)
    with connect(database) as db, Path(path).open('rb') as source:
        while True:
            line = source.readline(MAX_RECORD_BYTES + 1)
            if not line:
                break
            if len(line) > MAX_RECORD_BYTES:
                fingerprint = hashlib.sha256(line)
                sample = line[:1024].decode('utf-8', errors='replace')
                while line and not line.endswith(b'\n'):
                    line = source.readline(MAX_RECORD_BYTES + 1)
                    fingerprint.update(line)
                with db:
                    quarantine(db, fingerprint.hexdigest() + ':' + sample, 'record_too_large')
                counts['quarantined'] += 1
                continue
            try:
                record = json.loads(line, parse_constant=lambda value: (_ for _ in ()).throw(ValueError('nonfinite_json')))
                outcome = save_record(db, record)
            except (ValueError, UnicodeError, RecursionError) as exc:
                quarantine(db, line.decode('utf-8', errors='replace'), type(exc).__name__)
                outcome = 'quarantined'
            counts[outcome] += 1
            if sum(counts.values()) % 100 == 0:
                db.commit()
        db.commit()
    return counts


@exclusive_writer
def process_pending(database, limit=1000, retry=False):
    if not 1 <= limit <= 100000:
        raise ValueError('limit must be 1..100000')
    counts = dict(processed=0, failed=0)
    with connect(database) as db:
        rows = db.execute('''SELECT r.* FROM raw_posts r WHERE
            NOT EXISTS (SELECT 1 FROM parsed_posts p WHERE p.raw_id=r.id AND p.parser_version=?)
            AND (r.state!='failed' OR ?) AND (r.attempts<3 OR r.state='done') ORDER BY r.id LIMIT ?''',
                          (VERSION, retry, limit)).fetchall()
        for row in rows:
            if not db.in_transaction:
                db.execute('BEGIN')
            db.execute('SAVEPOINT item')
            try:
                parsed = parse_news(row['raw_text'])
                ready = utcnow()
                result = {'schema_version': 'iris-parsed-post/v1', 'source': 'watcher_guru',
                          'source_id': row['source_id'], 'content_hash': row['content_hash'],
                          'url': f"https://t.me/WatcherGuru/{row['source_id']}", 'raw_text': row['raw_text'],
                          'published_at': row['published_at'], 'observed_at': row['observed_at'],
                          'feature_ready_at': ready.isoformat(), 'collection_mode': row['collection_mode'],
                          'semantic_parse': parsed,
                          'weighting': weight_post(parsed, row['published_at'], ready)}
                ensure_capacity(db)
                db.execute('INSERT OR REPLACE INTO parsed_posts VALUES (?,?,?,?)',
                           (row['id'], VERSION, ready.isoformat(), json.dumps(result, ensure_ascii=False)))
                db.execute("UPDATE raw_posts SET state='done',error=NULL,attempts=0 WHERE id=?", (row['id'],))
                db.execute('RELEASE item')
                counts['processed'] += 1
            except Exception as exc:
                db.execute('ROLLBACK TO item')
                db.execute('RELEASE item')
                db.execute("UPDATE raw_posts SET state='failed',attempts=attempts+1,error=? WHERE id=?",
                           (f'{type(exc).__name__}: {str(exc)[:200]}', row['id']))
                counts['failed'] += 1
            if sum(counts.values()) % 100 == 0:
                db.commit()
        db.commit()
    return counts


@exclusive_writer
def requeue_failed(database):
    with connect(database) as db, db:
        count = db.execute("UPDATE raw_posts SET state='pending',attempts=0,error=NULL WHERE state='failed'").rowcount
    return {'requeued': count}


def status(database):
    with connect(database) as db:
        return {'raw': dict(db.execute('SELECT state,count(*) FROM raw_posts GROUP BY state').fetchall()),
                'quarantine': db.execute('SELECT count(*) FROM quarantine').fetchone()[0],
                'source_health': {r[0]: json.loads(r[1]) for r in db.execute('SELECT source,payload FROM source_health')},
                'pages': dict(db.execute('SELECT state,count(*) FROM fetch_pages GROUP BY state').fetchall()),
                'checkpoint': [json.loads(r[0]) for r in db.execute('SELECT payload FROM checkpoints')]}
