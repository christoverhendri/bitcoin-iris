"""Keyless BTC/USD one-minute ingestion and conservative activity reconciliation.

Important: absent candle != proven zero trades. INFERRED_NO_TRADE requires a
successful, complete one-minute fetch and a consistent independent one-hour
Coinbase candle; UNKNOWN is the default. Source observations and versions are
retained, so as-of classification cannot use future revisions or fetches.
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
from collections import Counter
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from .hourly_prices import (
    API_URL, HOUR, INSTRUMENT, SOURCE, _collector_lock, _float,
    _retry_after, _sha256, observed_stamp, stamp,
)

MINUTE = 60
PAGE_MINUTES = 240
MAX_PAGE_MINUTES = 299
MAX_PAGES = 1000
MAX_RESPONSE_BYTES = 512 * 1024
MAX_HOURS_REPORT = 744  # one month at a time; no six-million-row memory explosion
SCHEMA_VERSION = 'iris-minute-activity/v1'
DEFAULT_DATABASE = Path('artifacts/market/coinbase_minute.sqlite')
DEFAULT_HOURLY_DATABASE = Path('artifacts/market/coinbase_hourly.sqlite')


def parse_minute(raw: str | datetime) -> datetime:
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00')) if isinstance(raw, str) else raw
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(f'Invalid minute timestamp: {raw!r}') from exc
    if not isinstance(dt, datetime) or dt.tzinfo is None:
        raise ValueError('Minute timestamp needs an explicit timezone')
    dt = dt.astimezone(timezone.utc)
    if dt.second or dt.microsecond:
        raise ValueError('Minute timestamp must align to a minute boundary')
    return dt


def utc_minute(now=None) -> datetime:
    now = datetime.now(timezone.utc) if now is None else now
    if not isinstance(now, datetime) or now.tzinfo is None:
        raise ValueError('Current time needs a timezone')
    return now.astimezone(timezone.utc).replace(second=0, microsecond=0)


def _validate(payload, start: datetime, end: datetime):
    if not isinstance(payload, list) or len(payload) > 300:
        raise ValueError('Coinbase one-minute response must be a list of at most 300 candles')
    left, right = int(start.timestamp()), int(end.timestamp())
    unique = {}
    for raw in payload:
        if not isinstance(raw, list) or len(raw) != 6 or isinstance(raw[0], bool):
            raise ValueError('Expected [time, low, high, open, close, volume]')
        try:
            ts = int(raw[0])
            if float(raw[0]) != ts or ts % MINUTE:
                raise ValueError('Invalid minute boundary')
        except (ValueError, TypeError, OverflowError) as exc:
            raise ValueError('Invalid Coinbase minute timestamp') from exc
        if not left <= ts < right:  # Coinbase may include neighbouring buckets
            continue
        values = tuple(_float(v, label, i < 4) for i, (label, v) in enumerate(
            zip(('Low', 'High', 'Open', 'Close', 'Volume'), raw[1:])))
        low, high, opening, close, volume = values
        if low > min(opening, close) or high < max(opening, close) or low > high:
            raise ValueError(f'Inconsistent Coinbase OHLC at minute {ts}')
        if ts in unique and unique[ts] != values:
            raise ValueError(f'Conflicting duplicate Coinbase minute {ts}')
        unique[ts] = values
    return [(ts, *values) for ts, values in sorted(unique.items())]


def _request(start, end, *, get=requests.get, sleep=time.sleep):
    params = {'start': stamp(start), 'end': stamp(end), 'granularity': MINUTE}
    for attempt in range(4):
        with get(API_URL, params=params, stream=True, timeout=(10, 20), allow_redirects=False,
                 headers={'Accept': 'application/json', 'User-Agent': 'IRIS-Research-Data/1.0'}) as response:
            code = response.status_code
            if code in (429, 500, 502, 503, 504) and attempt < 3:
                sleep(max(2 ** attempt, _retry_after(response.headers.get('Retry-After'), datetime.now(timezone.utc))))
                continue
            if code != 200:
                raise RuntimeError(f'Coinbase Exchange minute request HTTP {code}; not checkpointed')
            if 'application/json' not in response.headers.get('Content-Type', '').lower():
                raise ValueError('Coinbase minute response was not JSON')
            raw_chunks, size, started = [], 0, time.monotonic()
            for chunk in response.iter_content(chunk_size=8192):
                if not isinstance(chunk, bytes):
                    raise ValueError('Non-byte Coinbase response')
                size += len(chunk)
                if size > MAX_RESPONSE_BYTES or time.monotonic() - started > 30:
                    raise ValueError('Coinbase minute page exceeded resource budget')
                raw_chunks.append(chunk)
            body = b''.join(raw_chunks)
        try:
            payload = json.loads(body, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))
        except (UnicodeError, ValueError) as exc:
            raise ValueError('Malformed Coinbase minute JSON') from exc
        return _validate(payload, start, end), hashlib.sha256(body).hexdigest()
    raise RuntimeError('Exhausted Coinbase retry budget')


def _schema(db):
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=15000')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS minute_candles (
        ts INTEGER NOT NULL, content_sha256 TEXT NOT NULL,
        low REAL NOT NULL, high REAL NOT NULL, open REAL NOT NULL,
        close REAL NOT NULL, volume REAL NOT NULL,
        PRIMARY KEY (ts,content_sha256));
      CREATE TABLE IF NOT EXISTS minute_seen (
        ts INTEGER NOT NULL, content_sha256 TEXT NOT NULL, seen_at TEXT NOT NULL,
        PRIMARY KEY(ts,content_sha256,seen_at),
        FOREIGN KEY(ts,content_sha256) REFERENCES minute_candles(ts,content_sha256));
      CREATE INDEX IF NOT EXISTS minute_seen_time ON minute_seen(ts,seen_at DESC);
      CREATE TABLE IF NOT EXISTS minute_windows (
        start_ts INTEGER NOT NULL, end_ts INTEGER NOT NULL,
        fetched_at TEXT NOT NULL, response_sha256 TEXT NOT NULL,
        row_count INTEGER NOT NULL, missing_count INTEGER NOT NULL,
        PRIMARY KEY(start_ts,end_ts,fetched_at));
      CREATE INDEX IF NOT EXISTS minute_window_lookup ON minute_windows(start_ts,end_ts,fetched_at);
      CREATE TABLE IF NOT EXISTS minute_errors (
        start_ts INTEGER NOT NULL,end_ts INTEGER NOT NULL,
        attempted_at TEXT NOT NULL,reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS store_identity (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    ''')
    for k, v in [('source', SOURCE), ('instrument', INSTRUMENT), ('granularity_seconds', str(MINUTE))]:
        prior = db.execute('SELECT value FROM store_identity WHERE key=?', (k,)).fetchone()
        if prior is not None and prior[0] != v:
            raise ValueError('Minute database belongs to a different source or interval')
        db.execute('INSERT OR IGNORE INTO store_identity VALUES (?,?)', (k, v))


def _open_read(path, *, tables):
    target = Path(path).resolve()
    if Path(path).is_symlink() or not target.is_file():
        raise FileNotFoundError(f'Canonical research SQLite database missing: {target}')
    conn = sqlite3.connect(target.as_uri() + '?mode=ro', uri=True)
    if any(not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone() for t in tables):
        conn.close()
        raise ValueError(f'Database schema mismatch: {target}')
    return conn


def backfill(database=DEFAULT_DATABASE, *, start, end=None, max_pages=12,
             page_minutes=PAGE_MINUTES, recheck_minutes=48 * 60, retry_gaps=False,
             get=requests.get, sleep=time.sleep, now=None, pace_seconds=0.4):
    first, cutoff = parse_minute(start), utc_minute(now)
    last = parse_minute(end) if end is not None else cutoff
    if not first < last <= cutoff or not 1 <= page_minutes <= MAX_PAGE_MINUTES:
        raise ValueError('Use completed minute ranges with 1..299 minute page size')
    if not 1 <= max_pages <= MAX_PAGES or not 0 <= recheck_minutes <= 525600 or pace_seconds < 0.25:
        raise ValueError('Invalid Coinbase minute request budget')
    dest = Path(database)
    dest.parent.mkdir(parents=True, exist_ok=True)
    report = {'source': SOURCE, 'instrument': INSTRUMENT, 'granularity_seconds': MINUTE,
              'start': stamp(first), 'end_exclusive': stamp(last),
              'fetched_pages': 0, 'skipped_pages': 0, 'new_versions': 0,
              'observed_minute_rows': 0, 'missing_slots_in_fetched_windows': 0,
              'all_windows_visited': False, 'next_start': None,
              'historical_backtest_safe': False}
    t = first
    threshold = int((last - timedelta(minutes=recheck_minutes)).timestamp())
    with _collector_lock(dest), closing(sqlite3.connect(dest, timeout=15)) as db:
        _schema(db)
        db.commit()
        while t < last:
            nxt = min(t + timedelta(minutes=page_minutes), last)
            left, right = int(t.timestamp()), int(nxt.timestamp())
            old = db.execute('''SELECT missing_count FROM minute_windows WHERE start_ts=? AND end_ts=?
                                ORDER BY fetched_at DESC LIMIT 1''', (left, right)).fetchone()
            if old and right <= threshold and (not retry_gaps or old[0] == 0):
                report['skipped_pages'] += 1
                t = nxt
                continue
            if report['fetched_pages'] >= max_pages:
                report['next_start'] = stamp(t)
                break
            if report['fetched_pages']:
                sleep(pace_seconds)
            try:
                rows, fingerprint = _request(t, nxt, get=get, sleep=sleep)
            except Exception as exc:
                with db:
                    db.execute('INSERT INTO minute_errors VALUES (?,?,?,?)',
                               (left, right, observed_stamp(datetime.now(timezone.utc) if now is None else now),
                                f'{type(exc).__name__}: {str(exc)[:180]}'))
                raise
            observed = observed_stamp(datetime.now(timezone.utc) if now is None else now)
            with db:
                for ts, low, high, opening, last_price, volume in rows:
                    content = hashlib.sha256(json.dumps([ts, low, high, opening, last_price, volume],
                                                         allow_nan=False, separators=(',', ':')).encode()).hexdigest()
                    cursor = db.execute('''INSERT OR IGNORE INTO minute_candles VALUES (?,?,?,?,?,?,?)''',
                                        (ts, content, low, high, opening, last_price, volume))
                    report['new_versions'] += int(cursor.rowcount > 0)
                    db.execute('INSERT OR IGNORE INTO minute_seen VALUES (?,?,?)', (ts, content, observed))
                db.execute('INSERT OR IGNORE INTO minute_windows VALUES (?,?,?,?,?,?)',
                           (left, right, observed, fingerprint, len(rows), (right-left)//MINUTE-len(rows)))
            report['fetched_pages'] += 1
            report['observed_minute_rows'] += len(rows)
            report['missing_slots_in_fetched_windows'] += (right-left)//MINUTE-len(rows)
            t = nxt
    report['all_windows_visited'] = report['next_start'] is None
    return report


def status(database=DEFAULT_DATABASE):
    with closing(_open_read(database, tables=('minute_candles', 'minute_seen', 'minute_windows','store_identity'))) as db:
        candles, observations, fetched, errors = (
            db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in
            ('minute_candles','minute_seen','minute_windows','minute_errors'))
        first, last = db.execute('SELECT MIN(ts),MAX(ts) FROM minute_candles').fetchone()
        return {'source': SOURCE, 'versions': candles,
                'distinct_minutes': db.execute('SELECT COUNT(DISTINCT ts) FROM minute_candles').fetchone()[0],
                'observations': observations, 'successful_fetches': fetched, 'errors': errors,
                'first_candle': stamp(datetime.fromtimestamp(first, timezone.utc)) if first is not None else None,
                'last_candle': stamp(datetime.fromtimestamp(last, timezone.utc)) if last is not None else None,
                'historical_backtest_safe': False}


def _covers_hour(windows, left, right):
    covered = left
    for ws, we in sorted(windows):
        if we <= covered:
            continue
        if ws > covered:
            return False
        covered = max(covered, we)
        if covered >= right:
            return True
    return False


def _hour_reference(db, hour_ts, cutoff):
    if db is None:
        return None
    row = db.execute('''SELECT ts,low,high,open,close,volume,payload_sha256,observed_at
           FROM hourly_candles WHERE ts=? AND observed_at<=?
           ORDER BY observed_at DESC,payload_sha256 DESC LIMIT 1''', (hour_ts, cutoff)).fetchone()
    if not row:
        return None
    return dict(zip(('ts','low','high','open','close','volume','payload_sha256','observed_at'), row))


def _minute_rows(db, hour_ts, cutoff):
    items = db.execute('''SELECT s.ts,m.low,m.high,m.open,m.close,m.volume,m.content_sha256,s.seen_at
        FROM minute_seen s JOIN minute_candles m
          ON m.ts=s.ts AND m.content_sha256=s.content_sha256
        WHERE s.ts>=? AND s.ts<? AND s.seen_at<=?
        ORDER BY s.ts,s.seen_at DESC,m.content_sha256 DESC''',
        (hour_ts, hour_ts+HOUR, cutoff)).fetchall()
    latest = {}
    for values in items:
        if values[0] not in latest:
            latest[values[0]] = dict(zip(('ts','low','high','open','close','volume','sha','seen_at'), values))
    return latest


def _reconcile(prices, reference, complete):
    if not complete:
        return False, 'minute_window_not_fully_fetched'
    if reference is None:
        return False, 'no_independent_hourly_candle_as_of'
    observed = sorted(prices.values(), key=lambda p: p['ts'])
    if not observed or not any(p['volume'] > 0 for p in observed):
        return False, 'no_positive_volume_minute_evidence'
    total = math.fsum(p['volume'] for p in observed)
    # Tight tolerances allow float/rounding noise but never missing real volume.
    vol_tol = max(1e-8, abs(reference['volume']) * 1e-6)
    price_tol = lambda px: max(1e-8, abs(px) * 1e-7)
    comparisons = [(total, reference['volume']),
                   (min(p['low'] for p in observed), reference['low']),
                   (max(p['high'] for p in observed), reference['high']),
                   (observed[0]['open'], reference['open']),
                   (observed[-1]['close'], reference['close'])]
    if abs(comparisons[0][0]-comparisons[0][1]) > vol_tol or any(
        abs(x-y) > price_tol(y) for x,y in comparisons[1:]):
        return False, 'one_hour_ohlcv_does_not_reconcile'
    return True, 'one_hour_ohlcv_reconciled'


def classify(minutes_db, hourly_db, *, start, end, as_of=None, with_rows=False):
    first, last = parse_minute(start), parse_minute(end)
    if first.minute or last.minute or not first < last:
        raise ValueError('Activity reconciliation requires UTC hour-aligned start/end')
    hours = int((last-first).total_seconds() / HOUR)
    if hours > MAX_HOURS_REPORT:
        raise ValueError('Reconcile no more than 744 hours at once; partition monthly')
    origin = utc_minute(parse_minute(as_of) if isinstance(as_of, str) else as_of) if as_of is not None else utc_minute()
    if last > origin:
        raise ValueError('Do not classify unfinished or future UTC hours')
    cutoff = observed_stamp(origin)
    hour_conn = (_open_read(hourly_db, tables=('hourly_candles','store_identity'))
                 if hourly_db is not None else None)
    output = []
    counts = Counter()
    diagnostics = Counter()
    details = []
    try:
        with closing(_open_read(minutes_db, tables=('minute_candles','minute_seen','minute_windows','store_identity'))) as db:
            minute_id = dict(db.execute('SELECT key,value FROM store_identity'))
            if minute_id != {'source': SOURCE, 'instrument': INSTRUMENT, 'granularity_seconds': str(MINUTE)}:
                raise ValueError('Not a Coinbase BTC/USD minute database')
            if hour_conn is not None:
                hour_id = dict(hour_conn.execute('SELECT key,value FROM store_identity'))
                if hour_id != {'source': SOURCE, 'instrument': INSTRUMENT, 'granularity_seconds': str(HOUR)}:
                    raise ValueError('Not a Coinbase BTC/USD hourly database')
            for i in range(hours):
                start_ts = int(first.timestamp()) + i * HOUR
                observed = _minute_rows(db, start_ts, cutoff)
                fetches = db.execute('''SELECT start_ts,end_ts,response_sha256,fetched_at FROM minute_windows
                       WHERE start_ts<? AND end_ts>? AND fetched_at<=?''',
                       (start_ts+HOUR,start_ts,cutoff)).fetchall()
                complete = _covers_hour([(r[0], r[1]) for r in fetches],start_ts,start_ts+HOUR)
                hourly = _hour_reference(hour_conn,start_ts,cutoff)
                matched, reason = _reconcile(observed,hourly,complete)
                unknown = inferred = traded = zero_candle = 0
                for j in range(60):
                    ts = start_ts + j * MINUTE
                    c = observed.get(ts)
                    if c is not None:
                        state = 'TRADED' if c['volume'] > 0 else 'ZERO_VOLUME_CANDLE'
                        traded += int(state == 'TRADED')
                        zero_candle += int(state == 'ZERO_VOLUME_CANDLE')
                        row = {'ts':ts,'utc':stamp(datetime.fromtimestamp(ts, timezone.utc)),
                               'status':state,'volume':c['volume'],
                               'open':c['open'],'high':c['high'],'low':c['low'],'close':c['close'],
                               'content_sha256':c['sha'],'observed_at':c['seen_at']}
                    else:
                        state = 'INFERRED_NO_TRADE' if matched else 'UNKNOWN'
                        inferred += int(matched)
                        unknown += int(not matched)
                        row = {'ts':ts,'utc':stamp(datetime.fromtimestamp(ts, timezone.utc)),
                               'status':state,'volume':0.0 if matched else None,
                               'open':None,'high':None,'low':None,'close':None,
                               'content_sha256':None,'observed_at':None}
                    counts[state] += 1
                    if with_rows:
                        output.append(row)
                if hourly is not None and complete and reason == 'one_hour_ohlcv_does_not_reconcile':
                    diagnostics['hourly_disagreement'] += 1
                if not complete:
                    diagnostics['unfetched_hours'] += 1
                if hourly is None:
                    diagnostics['missing_hourly_references'] += 1
                details.append({'hour':stamp(datetime.fromtimestamp(start_ts, timezone.utc)),
                                'minute_candles':len(observed),'hour_fetch_covered':complete,
                                'hourly_reference_sha256':hourly['payload_sha256'] if hourly else None,
                                'hourly_reference_observed_at':hourly['observed_at'] if hourly else None,
                                'minute_page_evidence':[{'sha256':r[2], 'fetched_at':r[3]} for r in fetches[:12]],
                                'reconciled':matched,'reason':reason,
                                'inferred_no_trade':inferred,'unknown':unknown,
                                'traded':traded,'zero_volume_candles':zero_candle})
    finally:
        if hour_conn is not None:
            hour_conn.close()
    quality = 'pass' if counts['UNKNOWN'] == 0 and not diagnostics['hourly_disagreement'] else 'fail'
    report = {'schema_version':SCHEMA_VERSION,'source':SOURCE,'instrument':INSTRUMENT,
              'granularity_seconds':MINUTE,'start':stamp(first),'end_exclusive':stamp(last),
              'as_of':stamp(origin),'quality_gate':quality,
              'historical_backtest_safe':False,
              'classification_note':'INFERRED_NO_TRADE is an evidence-based inference, not trade-ledger proof',
              'counts':{state:counts[state] for state in
                        ('TRADED','ZERO_VOLUME_CANDLE','INFERRED_NO_TRADE','UNKNOWN')},
              'diagnostics':dict(diagnostics),'hours':details}
    return (report,output) if with_rows else report


def write_report(report, output, *, rows=None, csv_output=None):
    target = Path(output)
    target.parent.mkdir(parents=True,exist_ok=True)
    if csv_output and target.resolve() == Path(csv_output).resolve():
        raise ValueError('CSV and JSON must use different paths')
    if rows is not None and csv_output:
        csv_target = Path(csv_output)
        csv_target.parent.mkdir(parents=True,exist_ok=True)
        with csv_target.open('x',newline='',encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['ts','utc','status','volume','open','high','low','close',
                                                    'content_sha256','observed_at'])
            writer.writeheader()
            writer.writerows(rows)
    with target.open('x',encoding='utf-8') as f:
        json.dump(report,f,indent=2,allow_nan=False)
        f.write('\n')


def export_parquet(minute_db, hourly_db, output, *, start, end, as_of=None):
    """Bounded immutable materialization of evidence-bearing activity statuses."""
    from .warehouse import _duckdb, _sql_path
    report,rows=classify(minute_db,hourly_db,start=start,end=end,as_of=as_of,with_rows=True)
    dest=Path(output).resolve()
    dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists():
        raise FileExistsError(f'Activity artifact already exists: {dest}')
    duckdb=_duckdb()
    with tempfile.TemporaryDirectory(prefix='.iris-minute-',dir=dest.parent) as tmp:
        stage=Path(tmp)
        target=stage/'minute_activity.parquet'
        con=duckdb.connect(':memory:')
        try:
            con.execute('''CREATE TABLE activity(
                ts BIGINT,utc VARCHAR,status VARCHAR,volume DOUBLE,
                "Open" DOUBLE,"High" DOUBLE,"Low" DOUBLE,"Close" DOUBLE,
                content_sha256 VARCHAR,observed_at VARCHAR)''')
            con.executemany('INSERT INTO activity VALUES (?,?,?,?,?,?,?,?,?,?)',
                            [tuple(r[k] for k in ('ts','utc','status','volume','open','high','low','close',
                                                  'content_sha256','observed_at')) for r in rows])
            con.execute(f'''COPY (SELECT * FROM activity ORDER BY ts) TO {_sql_path(target)}
                        (FORMAT PARQUET,COMPRESSION ZSTD)''')
        finally:
            con.close()
        manifest={'schema_version':SCHEMA_VERSION,'kind':'minute_activity',
                  'source':SOURCE,'instrument':INSTRUMENT,
                  'granularity_seconds':MINUTE,'row_count':len(rows),
                  'start':report['start'],'end_exclusive':report['end_exclusive'],
                  'as_of':report['as_of'],'status_counts':report['counts'],
                  'quality_gate':report['quality_gate'],
                  'data_file':'minute_activity.parquet','data_sha256':_sha256(target),
                  'historical_backtest_safe':False,
                  'provenance':'canonical local minute and hourly SQLite; see report.json'}
        (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        (stage/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        if dest.exists():
            raise FileExistsError(f'Activity artifact already exists: {dest}')
        os.rename(stage,dest)
    return verify_parquet(dest)


def verify_parquet(artifact):
    """Verify typed rows and digest, without pretending inferred labels are facts."""
    from .warehouse import _duckdb, _sql_path
    folder=Path(artifact).resolve()
    meta=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if not isinstance(meta,dict) or meta.get('schema_version')!=SCHEMA_VERSION or meta.get('kind')!='minute_activity':
        raise ValueError('Unknown activity manifest')
    target=folder/'minute_activity.parquet'
    if target.is_symlink() or not target.is_file() or _sha256(target)!=meta.get('data_sha256'):
        raise ValueError('Activity Parquet hash mismatch')
    first,last=parse_minute(meta['start']),parse_minute(meta['end_exclusive'])
    expected=int((last-first).total_seconds()/MINUTE)
    if expected!=meta.get('row_count') or expected<=0 or expected>MAX_HOURS_REPORT*60:
        raise ValueError('Activity manifest expected rows mismatch')
    with closing(_duckdb().connect(':memory:')) as con:
        rows=con.execute('''SELECT ts,status,volume,"Open","High","Low","Close"
            FROM read_parquet(?) ORDER BY ts''',[str(target)]).fetchall()
        names=[r[0] for r in con.execute(f'DESCRIBE SELECT * FROM read_parquet({_sql_path(target)})').fetchall()]
    if names!=['ts','utc','status','volume','Open','High','Low','Close','content_sha256','observed_at']:
        raise ValueError('Activity Parquet schema mismatch')
    statuses=Counter()
    for idx,(ts,state,volume,opening,high,low,close) in enumerate(rows):
        if ts != int(first.timestamp())+idx*MINUTE or state not in (
            'TRADED','ZERO_VOLUME_CANDLE','INFERRED_NO_TRADE','UNKNOWN'):
            raise ValueError('Unexpected minute slot or status')
        if state in ('UNKNOWN','INFERRED_NO_TRADE'):
            if any(x is not None for x in (opening,high,low,close)):
                raise ValueError('Missing minute was assigned synthetic OHLC')
            if (state=='UNKNOWN' and volume is not None) or (state=='INFERRED_NO_TRADE' and volume!=0):
                raise ValueError('Missing minute volume was fabricated')
        elif (any(x is None or not math.isfinite(x) for x in (opening,high,low,close,volume))
              or min(opening,high,low,close)<=0 or high<max(opening,close)
              or low>min(opening,close) or volume<0
              or (state=='TRADED' and volume==0) or (state=='ZERO_VOLUME_CANDLE' and volume!=0)):
            raise ValueError('Invalid traded minute OHLCV')
        statuses[state]+=1
    if len(rows)!=expected or dict(statuses)!= {k:v for k,v in meta['status_counts'].items() if v}:
        raise ValueError('Activity row count and summary disagree')
    report=json.loads((folder/'report.json').read_text(encoding='utf-8'))
    if (report.get('quality_gate') != meta.get('quality_gate')
        or report.get('counts') != meta.get('status_counts')
        or report.get('schema_version') != SCHEMA_VERSION):
        raise ValueError('Activity manifest and evidence report disagree')
    if meta.get('quality_gate') not in ('pass','fail'):
        raise ValueError('Invalid activity quality gate')
    return {'verified':True,'rows':len(rows),'quality_gate':meta['quality_gate'],
            'status_counts':dict(statuses),'data_sha256':meta['data_sha256'],
            'historical_backtest_safe':False}


def main(argv=None):
    p=argparse.ArgumentParser(description='Free Coinbase minute ingestion with safe no-trade inference')
    sub=p.add_subparsers(dest='command',required=True)
    b=sub.add_parser('backfill')
    b.add_argument('--database',type=Path,default=DEFAULT_DATABASE)
    b.add_argument('--start',required=True)
    b.add_argument('--end')
    b.add_argument('--page-minutes',type=int,default=PAGE_MINUTES)
    b.add_argument('--max-pages',type=int,default=12)
    b.add_argument('--retry-gaps',action='store_true')
    b.add_argument('--recheck-minutes',type=int,default=48*60)
    b.add_argument('--output',type=Path)
    st=sub.add_parser('status')
    st.add_argument('--database',type=Path,default=DEFAULT_DATABASE)
    rc=sub.add_parser('reconcile')
    rc.add_argument('--minute-database',type=Path,default=DEFAULT_DATABASE)
    rc.add_argument('--hourly-database',type=Path,default=DEFAULT_HOURLY_DATABASE)
    rc.add_argument('--start',required=True)
    rc.add_argument('--end',required=True)
    rc.add_argument('--as-of')
    rc.add_argument('--output',type=Path,required=True)
    rc.add_argument('--csv-output',type=Path)
    ex=sub.add_parser('export')
    ex.add_argument('--minute-database',type=Path,default=DEFAULT_DATABASE)
    ex.add_argument('--hourly-database',type=Path,default=DEFAULT_HOURLY_DATABASE)
    ex.add_argument('--start',required=True)
    ex.add_argument('--end',required=True)
    ex.add_argument('--as-of')
    ex.add_argument('--output',type=Path,required=True)
    vf=sub.add_parser('verify')
    vf.add_argument('--artifact',type=Path,required=True)
    args=p.parse_args(argv)
    if args.command=='backfill':
        result=backfill(args.database,start=args.start,end=args.end,
                        max_pages=args.max_pages,page_minutes=args.page_minutes,
                        recheck_minutes=args.recheck_minutes,retry_gaps=args.retry_gaps)
        if args.output:
            write_report(result,args.output)
    elif args.command=='status':
        result=status(args.database)
    elif args.command=='reconcile':
        if args.csv_output:
            result, rows=classify(args.minute_database,args.hourly_database,start=args.start,end=args.end,
                                  as_of=args.as_of,with_rows=True)
        else:
            result=classify(args.minute_database,args.hourly_database,start=args.start,end=args.end,
                            as_of=args.as_of)
            rows=None
        write_report(result,args.output,rows=rows,csv_output=args.csv_output)
    elif args.command=='export':
        result=export_parquet(args.minute_database,args.hourly_database,args.output,
                              start=args.start,end=args.end,as_of=args.as_of)
    else:
        result=verify_parquet(args.artifact)
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    main()
