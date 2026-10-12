"""Resumable free Coinbase Exchange BTC/USD hourly market-data foundation.

This does not attest historical as-of availability: the first recorded observation
of a historical candle is the time IRIS actually downloaded it. No guessed bars,
API credentials, fabricated zero values, or vendor-spliced market series.

Usage: python -m market_data.hourly_prices {probe,backfill,status,export,verify,daily}
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sqlite3
import tempfile
import time
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

API_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/candles'
SOURCE = 'coinbase-exchange'
INSTRUMENT = 'BTC/USD'
HOUR = 3600
PAGE_HOURS = 240  # below the strict 300-candle maximum
MAX_PAGE_HOURS = 299
MAX_PAGES = 1000
MAX_RESPONSE_BYTES = 512 * 1024
MAX_EXPORT_ROWS = 250_000
VERSION = 'iris-hourly/v1'
SCHEMA = 'iris-warehouse/v1'
DEFAULT_DATABASE = Path('artifacts/market/coinbase_hourly.sqlite')
DEFAULT_START = '2015-07-20T00:00:00Z'  # discovery target, not verified first candle


def parse_hour(raw: str | datetime) -> datetime:
    try:
        parsed = datetime.fromisoformat(raw.replace('Z', '+00:00')) if isinstance(raw, str) else raw
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(f'Invalid timezone-aware UTC hour: {raw!r}') from exc
    if not isinstance(parsed, datetime) or parsed.tzinfo is None:
        raise ValueError('Hourly timestamps must be timezone aware')
    parsed = parsed.astimezone(timezone.utc)
    if parsed.minute or parsed.second or parsed.microsecond:
        raise ValueError('Hourly timestamp must align to 00 minutes UTC')
    return parsed


def utc_hour(now=None):
    now = datetime.now(timezone.utc) if now is None else now
    if now.tzinfo is None:
        raise ValueError('Now requires a timezone')
    return now.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def stamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def observed_stamp(value: datetime) -> str:
    # Fixed fractional precision preserves chronological ordering in SQLite TEXT.
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _retry_after(value, at):
    if not value:
        return 0.0
    try:
        return min(120.0, max(0.0, float(value)))
    except (TypeError, ValueError):
        try:
            end = parsedate_to_datetime(value)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            return min(120.0, max(0.0, (end - at).total_seconds()))
        except (TypeError, ValueError, OverflowError):
            return 0.0


def _float(raw, label, positive=True):
    if isinstance(raw, bool) or not isinstance(raw, (str, int, float)):
        raise ValueError(f'Invalid numeric {label}')
    try:
        value = float(raw)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f'Invalid numeric {label}') from exc
    if not math.isfinite(value) or (value <= 0 if positive else value < 0):
        raise ValueError(f'Nonfinite or out-of-range {label}')
    return value


def _validate_candles(payload, start: datetime, end: datetime):
    if not isinstance(payload, list) or len(payload) > 300:
        raise ValueError('Coinbase hourly response must contain at most 300 candles')
    rows = {}
    left, right = int(start.timestamp()), int(end.timestamp())
    for raw in payload:
        if not isinstance(raw, list) or len(raw) != 6 or isinstance(raw[0], bool):
            raise ValueError('Expected [timestamp, low, high, open, close, volume]')
        try:
            ts = int(raw[0])
            if float(raw[0]) != ts or ts % HOUR:
                raise ValueError('Candle timestamp not aligned to UTC hour')
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError('Invalid Coinbase candle timestamp') from exc
        # Coinbase may return a candle preceding start or at inclusive end.
        if not left <= ts < right:
            continue
        values = tuple(_float(x, name, i != 4) for i, (name, x) in enumerate(zip(
            ('Low', 'High', 'Open', 'Close', 'Volume'), raw[1:])))
        low, high, opening, close, volume = values
        if low > min(opening, close) or high < max(opening, close) or low > high:
            raise ValueError(f'Coinbase OHLC envelope inconsistent at {ts}')
        if ts in rows and rows[ts] != values:
            raise ValueError(f'Conflicting duplicate hour in Coinbase page: {ts}')
        rows[ts] = values
    return [(ts, *values) for ts, values in sorted(rows.items())]


def _request_page(start, end, *, get=requests.get, sleep=time.sleep):
    params = {'granularity': HOUR, 'start': stamp(start), 'end': stamp(end)}
    for attempt in range(4):
        with get(API_URL, params=params, timeout=(10, 20), allow_redirects=False, stream=True,
                 headers={'Accept': 'application/json', 'User-Agent': 'IRIS-Research-Data/1.0'}) as response:
            code = response.status_code
            if code in (429, 500, 502, 503, 504) and attempt < 3:
                delay = max(1.0 * (2 ** attempt), _retry_after(response.headers.get('Retry-After'), datetime.now(timezone.utc)))
                sleep(delay)
                continue
            if code != 200:
                raise RuntimeError(f'Coinbase Exchange hourly HTTP {code}; no data persisted')
            if 'application/json' not in response.headers.get('Content-Type', '').lower():
                raise ValueError('Coinbase hourly response was not JSON')
            chunks, size = [], 0
            started = time.monotonic()
            for chunk in response.iter_content(chunk_size=8192):
                if not isinstance(chunk, bytes):
                    raise ValueError('Coinbase response returned non-byte content')
                size += len(chunk)
                if size > MAX_RESPONSE_BYTES or time.monotonic() - started > 30:
                    raise ValueError('Coinbase hourly response exceeded size/time budget')
                chunks.append(chunk)
            raw = b''.join(chunks)
        try:
            data = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
        except (UnicodeError, ValueError) as exc:
            raise ValueError('Malformed Coinbase JSON') from exc
        return _validate_candles(data, start, end), hashlib.sha256(raw).hexdigest()
    raise RuntimeError('Coinbase retry budget exhausted')


def probe(start: str, end: str, *, get=requests.get, sleep=time.sleep, now=None) -> dict:
    """A real request with no writes. Evidence is only about the queried window."""
    first, last, cutoff = parse_hour(start), parse_hour(end), utc_hour(now)
    if not first < last <= cutoff or (last - first) > timedelta(hours=MAX_PAGE_HOURS):
        raise ValueError('Probe needs 1..299 completed UTC hours')
    rows, response_hash = _request_page(first, last, get=get, sleep=sleep)
    expected = int((last - first).total_seconds() / HOUR)
    return {'source': SOURCE, 'instrument': INSTRUMENT, 'granularity_seconds': HOUR,
            'requested_start': stamp(first), 'requested_end_exclusive': stamp(last),
            'checked_at': stamp(datetime.now(timezone.utc) if now is None else now),
            'api_response_sha256': response_hash, 'received_hours': len(rows),
            'expected_hours': expected, 'missing_hours': expected - len(rows),
            'first_returned_hour': stamp(datetime.fromtimestamp(rows[0][0], timezone.utc)) if rows else None,
            'last_returned_hour': stamp(datetime.fromtimestamp(rows[-1][0], timezone.utc)) if rows else None,
            'historical_backtest_safe': False}


def _schema(db):
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA busy_timeout=15000')
    db.execute('''CREATE TABLE IF NOT EXISTS hourly_candles (
        ts INTEGER NOT NULL, payload_sha256 TEXT NOT NULL, observed_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL, low REAL NOT NULL, high REAL NOT NULL, open REAL NOT NULL,
        close REAL NOT NULL, volume REAL NOT NULL,
        PRIMARY KEY(ts,payload_sha256))''')
    db.execute('''CREATE INDEX IF NOT EXISTS hourly_candle_latest
                  ON hourly_candles(ts, last_seen_at DESC)''')
    db.execute('''CREATE TABLE IF NOT EXISTS hourly_windows (
        start_ts INTEGER NOT NULL, end_ts INTEGER NOT NULL, fetched_at TEXT NOT NULL,
        response_sha256 TEXT NOT NULL, rows_received INTEGER NOT NULL,
        missing_hours INTEGER NOT NULL,
        PRIMARY KEY(start_ts,end_ts))''')
    db.execute('''CREATE TABLE IF NOT EXISTS store_identity (
        key TEXT PRIMARY KEY, value TEXT NOT NULL)''')
    for key, value in [('source', SOURCE), ('instrument', INSTRUMENT), ('granularity_seconds', str(HOUR))]:
        existing = db.execute('SELECT value FROM store_identity WHERE key=?', (key,)).fetchone()
        if existing is not None and existing[0] != value:
            raise ValueError('Database belongs to a different market data source')
        db.execute('INSERT OR IGNORE INTO store_identity(key,value) VALUES (?,?)', (key, value))


def _windows(start, end, hours):
    period = timedelta(hours=hours)
    current = start
    while current < end:
        nxt = min(current + period, end)
        yield current, nxt
        current = nxt


@contextmanager
def _collector_lock(database):
    """Refuse concurrent collectors for the same canonical SQLite file."""
    lock_path = Path(str(Path(database).resolve()) + '.writer.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+b') as handle:
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise RuntimeError('Another Coinbase hourly writer is active') from exc
        else:
            import fcntl
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                raise RuntimeError('Another Coinbase hourly writer is active') from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def backfill(database=DEFAULT_DATABASE, *, start=DEFAULT_START, end=None, max_pages=12,
             page_hours=PAGE_HOURS, recheck_hours=48, retry_gaps=False,
             get=requests.get, sleep=time.sleep, now=None, pace_seconds=0.4) -> dict:
    """Persist validated pages atomically and resume via per-window checkpoints.

    Existing historical windows are skipped. The current tail is re-queried to
    observe revisions; missing hours remain missing and are reported.
    """
    first = parse_hour(start)
    cutoff = utc_hour(now)
    last = parse_hour(end) if end is not None else cutoff
    if first >= last or last > cutoff or not 1 <= page_hours <= MAX_PAGE_HOURS:
        raise ValueError('Invalid bounds or page length; only completed hours can be fetched')
    if not 1 <= max_pages <= MAX_PAGES or not 0 <= recheck_hours <= 24 * 365 or pace_seconds < 0.25:
        raise ValueError('Invalid request budget or recheck window')
    path = Path(database)
    path.parent.mkdir(parents=True, exist_ok=True)
    report = {'source': SOURCE, 'instrument': INSTRUMENT, 'granularity_seconds': HOUR,
              'requested_start': stamp(first), 'requested_end_exclusive': stamp(last),
              'database': str(path), 'max_pages': max_pages, 'fetched_pages': 0,
              'skipped_pages': 0, 'new_candle_versions': 0, 'unchanged_candles': 0,
              'missing_slots_in_fetched_windows': 0, 'all_windows_visited': False,
              'next_start': None, 'historical_backtest_safe': False}
    checkpoint_threshold = int((last - timedelta(hours=recheck_hours)).timestamp())
    with _collector_lock(path), closing(sqlite3.connect(path, timeout=15)) as db:
        _schema(db)
        db.commit()
        for ws, we in _windows(first, last, page_hours):
            left, right = int(ws.timestamp()), int(we.timestamp())
            existing = db.execute('''SELECT missing_hours FROM hourly_windows
                WHERE start_ts=? AND end_ts=?''', (left, right)).fetchone()
            if existing and right <= checkpoint_threshold and (not retry_gaps or existing[0] == 0):
                report['skipped_pages'] += 1
                continue
            if report['fetched_pages'] >= max_pages:
                report['next_start'] = stamp(ws)
                break
            if report['fetched_pages']:
                sleep(pace_seconds)
            rows, response_hash = _request_page(ws, we, get=get, sleep=sleep)
            observed = observed_stamp(datetime.now(timezone.utc) if now is None else now)
            expected = int((we - ws).total_seconds() / HOUR)
            with db:
                for ts, low, high, opening, close, volume in rows:
                    key = hashlib.sha256(json.dumps([ts, low, high, opening, close, volume],
                                               separators=(',', ':'), allow_nan=False).encode()).hexdigest()
                    known = db.execute('SELECT 1 FROM hourly_candles WHERE ts=? AND payload_sha256=?', (ts, key)).fetchone() is not None
                    db.execute('''INSERT INTO hourly_candles
                        (ts,payload_sha256,observed_at,last_seen_at,low,high,open,close,volume)
                        VALUES (?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(ts,payload_sha256) DO UPDATE SET
                        last_seen_at=excluded.last_seen_at''',
                        (ts, key, observed, observed, low, high, opening, close, volume))
                    if not known:
                        report['new_candle_versions'] += 1
                    else:
                        report['unchanged_candles'] += 1
                db.execute('''INSERT INTO hourly_windows
                    (start_ts,end_ts,fetched_at,response_sha256,rows_received,missing_hours)
                    VALUES (?,?,?,?,?,?) ON CONFLICT(start_ts,end_ts) DO UPDATE SET
                    fetched_at=excluded.fetched_at,response_sha256=excluded.response_sha256,
                    rows_received=excluded.rows_received,missing_hours=excluded.missing_hours''',
                    (left, right, observed, response_hash, len(rows), expected - len(rows)))
            report['missing_slots_in_fetched_windows'] += expected - len(rows)
            report['fetched_pages'] += 1
    report['all_windows_visited'] = report['next_start'] is None
    return report


def _read_only(database):
    path = Path(database).resolve()
    if not path.is_file() or path.is_symlink():
        raise FileNotFoundError(f'Hourly source SQLite not present: {path}')
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    for name in ('hourly_candles', 'hourly_windows', 'store_identity'):
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name=? AND type='table'", (name,)).fetchone():
            db.close()
            raise ValueError('Not a canonical hourly Coinbase database')
    return db


def status(database=DEFAULT_DATABASE) -> dict:
    with closing(_read_only(database)) as db:
        count = db.execute('SELECT COUNT(*) FROM hourly_candles').fetchone()[0]
        unique_hours = db.execute('SELECT COUNT(DISTINCT ts) FROM hourly_candles').fetchone()[0]
        windows, missing = db.execute('SELECT COUNT(*),COALESCE(SUM(missing_hours),0) FROM hourly_windows').fetchone()
        earliest, latest = db.execute('SELECT MIN(ts),MAX(ts) FROM hourly_candles').fetchone()
        revision_hours = db.execute('''SELECT COUNT(*) FROM
            (SELECT ts FROM hourly_candles GROUP BY ts HAVING COUNT(*)>1)''').fetchone()[0]
    def dt(v):
        return stamp(datetime.fromtimestamp(v, timezone.utc)) if v is not None else None
    return {'source': SOURCE, 'unique_hours': unique_hours, 'versions': count,
            'revised_hours': revision_hours, 'fetched_windows': windows,
            'missing_slots_in_recorded_windows': missing, 'first_hour': dt(earliest),
            'last_hour': dt(latest), 'historical_backtest_safe': False}


def _publish(folder: Path, producer):
    target = Path(folder).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(f'Output already exists: {target}')
    with tempfile.TemporaryDirectory(prefix='.iris-hourly-', dir=target.parent) as tmp:
        stage = Path(tmp)
        result = producer(stage)
        (stage / 'manifest.json').write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        if target.exists():
            raise FileExistsError(f'Output already exists: {target}')
        os.rename(stage, target)
    return {'output': str(target), 'rows': result['row_count'],
            'coverage_pct': result['coverage_pct'], 'quality_gate': result['quality_gate']}


def export_hourly(database, output, *, start, end):
    """Produce immutable Parquet of latest-known versions of completed hourly bars."""
    from .warehouse import _duckdb, _sql_path  # optional dependency, no runtime server
    first, last = parse_hour(start), parse_hour(end)
    if not first < last <= utc_hour():
        raise ValueError('Export must use completed UTC hours')
    count_expected = int((last - first).total_seconds() / HOUR)
    if count_expected > MAX_EXPORT_ROWS:
        raise ValueError('Export too large; split historical range into immutable partitions')
    db_path = Path(database)
    with closing(_read_only(db_path)) as src:
        identity = dict(src.execute('SELECT key,value FROM store_identity'))
        if identity != {'source': SOURCE, 'instrument': INSTRUMENT, 'granularity_seconds': str(HOUR)}:
            raise ValueError('Not a canonical Coinbase BTC/USD hourly store')
    duckdb = _duckdb()

    def make(stage):
        parquet_path = stage / 'hourly.parquet'
        con = duckdb.connect(str(stage / 'conversion.duckdb'))
        count, prior, missed, first_seen, last_seen = 0, None, [], None, None
        earliest_observed, latest_observed = None, None
        try:
            con.execute('''CREATE TABLE hourly (
                ts BIGINT, Low DOUBLE, High DOUBLE, Open DOUBLE,
                Close DOUBLE, Volume DOUBLE, observed_at VARCHAR, payload_sha256 VARCHAR)''')
            with closing(_read_only(db_path)) as src:
                src.execute('BEGIN')
                cursor = src.execute('''SELECT ts,low,high,open,close,volume,observed_at,payload_sha256
                    FROM (SELECT *, ROW_NUMBER() OVER
                      (PARTITION BY ts ORDER BY last_seen_at DESC, payload_sha256 DESC) AS rank
                      FROM hourly_candles WHERE ts>=? AND ts<?) WHERE rank=1 ORDER BY ts''',
                     (int(first.timestamp()), int(last.timestamp())))
                batch = []
                for ts, low, high, opening, close, volume, observed, digest in cursor:
                    if (ts % HOUR or ts < int(first.timestamp()) or ts >= int(last.timestamp())
                        or not all(math.isfinite(v) for v in (low, high, opening, close, volume))
                        or min(low, high, opening, close) <= 0 or volume < 0
                        or low > min(opening, close) or high < max(opening, close)
                        or not isinstance(digest, str) or len(digest) != 64):
                        raise ValueError('Corrupt canonical Coinbase hourly candle')
                    if prior is not None and ts <= prior:
                        raise ValueError('Nonmonotonic or duplicate hour in canonical store')
                    if count == 0:
                        first_seen = ts
                    if prior is None:
                        gap_start = int(first.timestamp())
                    else:
                        gap_start = prior + HOUR
                    for gap in range(gap_start, ts, HOUR):
                        if len(missed) < 16:
                            missed.append(stamp(datetime.fromtimestamp(gap, timezone.utc)))
                    prior = last_seen = ts
                    count += 1
                    obs = parse_hour_or_any(observed)
                    earliest_observed = min(earliest_observed, obs) if earliest_observed else obs
                    latest_observed = max(latest_observed, obs) if latest_observed else obs
                    batch.append((ts, low, high, opening, close, volume, observed, digest))
                    if len(batch) >= 5000:
                        con.executemany('INSERT INTO hourly VALUES (?,?,?,?,?,?,?,?)', batch)
                        batch.clear()
                if batch:
                    con.executemany('INSERT INTO hourly VALUES (?,?,?,?,?,?,?,?)', batch)
                src.rollback()
            if count == 0:
                raise ValueError('No canonical hourly data in requested range')
            for gap in range(last_seen + HOUR, int(last.timestamp()), HOUR):
                if len(missed) < 16:
                    missed.append(stamp(datetime.fromtimestamp(gap, timezone.utc)))
            con.execute(f'''COPY (SELECT * FROM hourly ORDER BY ts)
                TO {_sql_path(parquet_path)} (FORMAT PARQUET, COMPRESSION ZSTD)''')
        finally:
            con.close()
            for temp in stage.glob('conversion.duckdb*'):
                temp.unlink()
        observed_count = count
        return {'schema_version': SCHEMA, 'kind': 'prices_hourly', 'row_count': count,
                'expected_rows': count_expected, 'coverage_pct': round(100 * count / count_expected, 5),
                'quality_gate': 'pass' if count == count_expected else 'fail',
                'missing_hours': count_expected - count, 'missing_examples': missed,
                'source': SOURCE, 'venue': SOURCE, 'instrument': INSTRUMENT,
                'granularity_seconds': HOUR, 'data_file': 'hourly.parquet',
                'data_sha256': _sha256(parquet_path), 'requested_start': stamp(first),
                'requested_end_exclusive': stamp(last),
                'first_observed_hour': stamp(datetime.fromtimestamp(first_seen, timezone.utc)),
                'last_observed_hour': stamp(datetime.fromtimestamp(last_seen, timezone.utc)),
                'first_downloaded_at': stamp(earliest_observed),
                'last_downloaded_at': stamp(latest_observed),
                'exported_at': stamp(datetime.now(timezone.utc)),
                'time_basis': 'original_hour_UTC_with_local_observed_at',
                'historical_backtest_safe': False,
                'warning': 'A retrospective candle download does not prove its historical vendor publication time.'}
    return _publish(Path(output), make)


def parse_hour_or_any(raw):
    try:
        dt = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            raise ValueError('Naive timestamp')
        return dt.astimezone(timezone.utc)
    except (TypeError, AttributeError, ValueError) as exc:
        raise ValueError('Invalid canonical observed_at timestamp') from exc


def verify_hourly(artifact):
    """Verifies Parquet schema/count/hash and coverage. Missing candles fail the gate."""
    from .warehouse import verify_export, _duckdb
    folder = Path(artifact).resolve()
    checked = verify_export(folder)
    meta = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    if checked['kind'] != 'prices_hourly' or meta.get('instrument') != INSTRUMENT or meta.get('source') != SOURCE:
        raise ValueError('Not a trusted Coinbase BTC/USD hourly Parquet')
    first, last = parse_hour(meta['requested_start']), parse_hour(meta['requested_end_exclusive'])
    expected = int((last - first).total_seconds() / HOUR)
    if not 0 < expected <= MAX_EXPORT_ROWS:
        raise ValueError('Invalid hourly Parquet range')
    duckdb = _duckdb()
    with closing(duckdb.connect(':memory:')) as db:
        actual_count, distinct, offgrid, invalid = db.execute('''SELECT count(*),count(DISTINCT ts),
            sum(CASE WHEN ts % 3600 != 0 OR ts < ? OR ts >= ? THEN 1 ELSE 0 END),
            sum(CASE WHEN Low <= 0 OR High <= 0 OR Open <= 0 OR Close <= 0 OR Volume < 0
                     OR Low > LEAST(Open,Close) OR High < GREATEST(Open,Close)
                     OR NOT isfinite(Low) OR NOT isfinite(High) OR NOT isfinite(Open)
                     OR NOT isfinite(Close) OR NOT isfinite(Volume) THEN 1 ELSE 0 END)
            FROM read_parquet(?)''',
            [int(first.timestamp()), int(last.timestamp()), str(folder / 'hourly.parquet')]).fetchone()
    if (actual_count != distinct or offgrid or invalid or actual_count != meta['row_count']
        or meta['expected_rows'] != expected or meta.get('missing_hours') != expected - actual_count
        or meta.get('quality_gate') != ('pass' if actual_count == expected else 'fail')):
        raise ValueError('Hourly manifest coverage/schema/invariants mismatch')
    return {'schema_version': VERSION, 'kind': 'prices_hourly', 'source': SOURCE,
            'quality_gate': 'pass' if actual_count == expected else 'fail',
            'data_sha256': checked['data_sha256'], 'observed_hours': actual_count,
            'expected_hours': expected, 'missing_hours': expected - actual_count,
            'coverage_pct': round(100 * actual_count / expected, 5),
            'first_hour': meta['first_observed_hour'], 'last_hour': meta['last_observed_hour'],
            'historical_backtest_safe': False}


def export_daily(artifact, output, *, start, end):
    """Derive Coinbase BTC/USD daily candles only from complete sets of 24 hours.

    The generated Coinbase-shaped CSV can enter the existing warehouse ->
    quality -> forecast process without pretending it was the venue's native 1d feed.
    """
    from .warehouse import _duckdb
    folder = Path(artifact).resolve()
    checked = verify_hourly(folder)
    begin, finish = parse_hour(start), parse_hour(end)
    if begin.hour or finish.hour or not begin < finish:
        raise ValueError('Daily aggregation requires UTC-midnight start/end')
    meta = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    if begin < parse_hour(meta['requested_start']) or finish > parse_hour(meta['requested_end_exclusive']):
        raise ValueError('Requested dates outside the verified hourly artifact')
    n_days = (finish - begin).days
    if not n_days or n_days > MAX_EXPORT_ROWS // 24:
        raise ValueError('Invalid daily aggregation size')
    duckdb = _duckdb()
    with closing(duckdb.connect(':memory:')) as db:
        daily = db.execute('''SELECT CAST(FLOOR(ts/86400) AS BIGINT) AS day,
          COUNT(*) AS n, MIN(Low) AS Low, MAX(High) AS High,
          arg_min(Open,ts) AS Open, arg_max(Close,ts) AS Close,
          SUM(Volume) AS Volume FROM read_parquet(?)
          WHERE ts >= ? AND ts < ? GROUP BY 1 ORDER BY 1''',
          [str(folder / 'hourly.parquet'), int(begin.timestamp()), int(finish.timestamp())]).fetchall()
    if len(daily) != n_days or any(r[1] != 24 or r[0] != int(begin.timestamp()) // 86400 + i
                                    for i, r in enumerate(daily)):
        raise ValueError('Missing hourly bars; cannot fabricate daily OHLCV')
    target = Path(output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(f'Daily output already exists: {target}')
    with tempfile.TemporaryDirectory(prefix='.iris-daily-', dir=target.parent) as tmp:
        stage = Path(tmp)
        csv_path = stage / 'prices.csv'
        with csv_path.open('x', newline='', encoding='utf-8') as dest:
            writer = csv.writer(dest)
            writer.writerow(['date', 'Low', 'High', 'Open', 'Close', 'Volume'])
            for day, count, low, high, opening, close, volume in daily:
                writer.writerow([datetime.fromtimestamp(day*86400, timezone.utc).date().isoformat(),
                                 low, high, opening, close, volume])
        provenance = {'source': SOURCE, 'venue': SOURCE, 'instrument': INSTRUMENT,
                      'requested_start': begin.date().isoformat(),
                      'requested_end_exclusive': stamp(finish),
                      'granularity_seconds': 86400, 'fetched_at': meta['last_downloaded_at'],
                      'data_sha256': _sha256(csv_path),
                      'derived_from': 'Coinbase hourly candles',
                      'source_hourly_sha256': checked['data_sha256'],
                      'historical_backtest_safe': False}
        (stage / 'provenance.json').write_text(json.dumps(provenance, indent=2)+'\n',encoding='utf-8')
        if target.exists():
            raise FileExistsError(f'Daily output already exists: {target}')
        os.rename(stage, target)
    return {'output':str(target),'daily_bars':len(daily),'hourly_source_sha256':checked['data_sha256']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    cmds = parser.add_subparsers(dest='command', required=True)
    p = cmds.add_parser('probe', help='Live keyless Coinbase API check (no storage)')
    p.add_argument('--start', required=True)
    p.add_argument('--end', required=True)
    p.add_argument('--output', type=Path)
    b = cmds.add_parser('backfill', help='Resumable 1h Coinbase ingestion into SQLite')
    b.add_argument('--database', type=Path, default=DEFAULT_DATABASE)
    b.add_argument('--start', default=DEFAULT_START)
    b.add_argument('--end')
    b.add_argument('--page-hours', type=int, default=PAGE_HOURS)
    b.add_argument('--max-pages', type=int, default=12)
    b.add_argument('--recheck-hours', type=int, default=48)
    b.add_argument('--retry-gaps', action='store_true')
    b.add_argument('--output', type=Path, help='Optional new-only run report JSON')
    s = cmds.add_parser('status', help='Summarize saved hourly candles and revisions')
    s.add_argument('--database', type=Path, default=DEFAULT_DATABASE)
    e = cmds.add_parser('export', help='Export immutable hourly Parquet from SQLite')
    e.add_argument('--database', type=Path, default=DEFAULT_DATABASE)
    e.add_argument('--output', type=Path, required=True)
    e.add_argument('--start', required=True)
    e.add_argument('--end', required=True)
    v = cmds.add_parser('verify', help='Verify hourly Parquet and coverage')
    v.add_argument('--artifact', type=Path, required=True)
    d = cmds.add_parser('daily', help='Derive strict complete-day candles from hourly Parquet')
    d.add_argument('--artifact', type=Path, required=True)
    d.add_argument('--start', required=True)
    d.add_argument('--end', required=True)
    d.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == 'probe':
        result = probe(args.start, args.end)
    elif args.command == 'backfill':
        result = backfill(args.database, start=args.start, end=args.end,
            max_pages=args.max_pages, page_hours=args.page_hours,
            recheck_hours=args.recheck_hours, retry_gaps=args.retry_gaps)
    elif args.command == 'status':
        result = status(args.database)
    elif args.command == 'export':
        result = export_hourly(args.database, args.output, start=args.start, end=args.end)
    elif args.command == 'verify':
        result = verify_hourly(args.artifact)
    else:
        result = export_daily(args.artifact, args.output, start=args.start, end=args.end)
    if getattr(args, 'output', None) is not None and args.command in ('probe', 'backfill'):
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x', encoding='utf-8') as dest:
            json.dump(result, dest, indent=2, allow_nan=False)
            dest.write('\n')
    print(json.dumps(result, indent=2, allow_nan=False))
    if args.command == 'verify' and result['quality_gate'] != 'pass':
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
