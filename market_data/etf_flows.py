"""Free-source US spot BTC ETF daily fund flows (USD millions), research only.

Farside's public table is a secondary compilation, not a vintage/release-time API.
Explicit opt-in fetch or saved HTML import. Never manufacture zero flows from '--'.
Historical downloads are *retrospective*: source session != IRIS observed_at.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import closing, contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import time

from bs4 import BeautifulSoup
import requests

SOURCE = 'farside-investors'
URL = 'https://farside.co.uk/bitcoin-etf-flow-all-data/'
INSTRUMENT = 'US_SPOT_BTC_ETF'
UNIT = 'USD_millions'
VERSION = 'iris-etf-flows/v1'
FIRST_SESSION = date(2024, 1, 11)
DEFAULT_DATABASE = Path('artifacts/market/etf_flows.sqlite')
MAX_HTML_BYTES = 5 * 1024 * 1024
MAX_SESSIONS = 2500
MAX_FUNDS = 32
MISSING = {'', '-', '—', '–', 'n/a', 'na', 'tbc', 'pending', 'null'}
FUNDS_REQUIRED = {'IBIT', 'FBTC', 'GBTC'}
DATE_FORMATS = ('%d %b %Y', '%d %B %Y', '%b %d, %Y', '%B %d, %Y')
STATUSES = {'REPORTED', 'NO_FUND_DATA', 'TOTAL_UNREPORTED'}
EXPECTED_FUND_COLUMNS = 5


def _asof(raw=None) -> datetime:
    if raw is None:
        return datetime.now(timezone.utc)
    if isinstance(raw, str):
        try:
            value = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('Expected timestamp with explicit timezone') from exc
    else:
        value = raw
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError('As-of requires timezone-aware timestamp')
    return value.astimezone(timezone.utc)


def _timestamp(value=None) -> str:
    return _asof(value).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_date(text: str) -> date | None:
    value = re.sub(r'\s+', ' ', text).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None


def _parse_amount(raw: str) -> str | None:
    v = re.sub(r'\s+', '', raw.replace('\u2212', '-')).strip()
    if v.lower() in MISSING:
        return None
    v = v.replace('$', '').replace(',', '')
    if v.startswith('(') and v.endswith(')'):
        v = '-' + v[1:-1]
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)', v):
        raise ValueError(f'Unrecognized ETF flow value {raw[:48]!r}')
    try:
        number = Decimal(v)
    except InvalidOperation as exc:
        raise ValueError('Invalid ETF amount') from exc
    if not number.is_finite() or abs(number) > 100_000:
        raise ValueError('ETF flow value outside safe USD-million range')
    if number == 0:
        return '0'
    return format(number.normalize(), 'f')


def _cells(tr) -> list[str]:
    return [c.get_text(' ', strip=True).replace('\xa0', ' ').strip()
            for c in tr.find_all(['th', 'td'], recursive=False)]


def parse_farside_html(html: bytes | str) -> list[dict]:
    """Parse full public Farside all-data table; never confuse missing with zero."""
    if isinstance(html, bytes):
        if len(html) > MAX_HTML_BYTES:
            raise ValueError('HTML exceeds fixed size budget')
        html = html.decode('utf-8', errors='strict')
    if not isinstance(html, str) or len(html.encode('utf-8')) > MAX_HTML_BYTES:
        raise ValueError('HTML must be bounded UTF-8 content')
    soup = BeautifulSoup(html, 'html.parser')
    text = soup.get_text(' ', strip=True).lower()
    if 'bitcoin' not in text or 'etf' not in text:
        raise ValueError('Not a Bitcoin ETF table document')
    if 'us$m' not in text and 'usd million' not in text and 'usd m' not in text:
        raise ValueError('Expected public Bitcoin ETF flow unit: US$m')
    selected = []
    for table in soup.find_all('table'):
        for tr in table.find_all('tr')[:12]:
            headers = [_t.upper().strip().replace(' ', '') for _t in _cells(tr)]
            if headers and headers[0] == 'DATE' and any(t in {'TOTAL', 'TOTALS'} for t in headers) \
                    and FUNDS_REQUIRED.issubset(set(headers)):
                selected.append((table, tr, headers))
                break
    if len(selected) != 1:
        raise ValueError(f'Expected precisely one identifiable Farside BTC ETF flow table; found {len(selected)}')
    table, header, headers = selected[0]
    if headers[-1] not in {'TOTAL', 'TOTALS'} or len(headers) < EXPECTED_FUND_COLUMNS + 2:
        raise ValueError('ETF total must be final column after five or more fund tickers')
    funds = headers[1:-1]
    if (len(funds) > MAX_FUNDS or len(funds) < EXPECTED_FUND_COLUMNS or len(set(funds)) != len(funds)
        or any(not re.fullmatch(r'[A-Z][A-Z0-9]{1,7}', t) for t in funds)):
        raise ValueError('Unexpected, duplicate or oversized ETF ticker headers')
    rows, seen, after_header = [], set(), False
    for tr in table.find_all('tr'):
        if tr is header:
            after_header = True
            continue
        if not after_header:
            continue
        cells = _cells(tr)
        if not cells:
            continue
        session = _parse_date(cells[0])
        if session is None:
            # Summary/footer rows are not price observations. Reject date-like
            # malformed source rows instead of silently deleting one session.
            if re.match(r'^\d{1,2}\s+[A-Za-z]{3}', cells[0]) or re.match(r'^[A-Za-z]{3}\s+\d{1,2}', cells[0]):
                raise ValueError(f'Invalid ETF date {cells[0][:40]!r}')
            continue
        if not FIRST_SESSION <= session <= date(2100, 1, 1):
            raise ValueError('ETF observation date out of supported range')
        if session in seen:
            raise ValueError(f'Duplicate ETF session {session}')
        seen.add(session)
        if len(cells) != len(headers):
            raise ValueError(f'ETF session {session}: header/column misalignment')
        per_fund = {ticker: _parse_amount(v) for ticker, v in zip(funds, cells[1:-1])}
        total = _parse_amount(cells[-1])
        observed = [Decimal(v) for v in per_fund.values() if v is not None]
        if not observed:
            # Printed 0 on a holiday is NOT a witnessed zero-flow session.
            if total is not None and Decimal(total) != 0:
                raise ValueError(f'ETF session {session}: nonzero total without any fund values')
            state = 'NO_FUND_DATA'
        elif total is None:
            state = 'TOTAL_UNREPORTED'
        else:
            # Reported totals should agree with the *reported* fund cells.
            # No assumption that blank/unlaunched funds have zero flow.
            tolerance = max(Decimal('1.0'), Decimal('0.08') * (len(observed) + 1))
            if abs(sum(observed, Decimal(0)) - Decimal(total)) > tolerance:
                raise ValueError(f'ETF session {session}: provider total disagrees with per-fund values')
            state = 'REPORTED'
        rows.append({'session': session.isoformat(), 'funds': per_fund,
                     'total_usd_m': total, 'reporting_state': state})
        if len(rows) > MAX_SESSIONS:
            raise ValueError('ETF history exceeds bounded session capacity')
    if not rows:
        raise ValueError('No dated ETF flow records found')
    return sorted(rows, key=lambda x: x['session'])


def fetch_public_html(*, get=requests.get, sleep=time.sleep) -> bytes:
    """One explicit, bounded public-page request; never bypass access controls."""
    headers = {'Accept': 'text/html', 'User-Agent': 'Bitcoin-IRIS-Research/1.0 (noncommercial; public-data audit)'}
    for attempt in range(3):
        with get(URL, timeout=(10, 20), stream=True, allow_redirects=False, headers=headers) as response:
            if response.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                wait = min(20.0, 2 ** attempt)
                value = response.headers.get('Retry-After')
                if value and value.isdecimal():
                    wait = max(wait, min(60.0, float(value)))
                sleep(wait)
                continue
            if response.status_code != 200:
                raise RuntimeError(f'Farside HTTP {response.status_code}; no content ingested')
            if 'text/html' not in response.headers.get('Content-Type', '').lower():
                raise ValueError('Farside response is not HTML')
            parts, size, started = [], 0, time.monotonic()
            for chunk in response.iter_content(8192):
                if not isinstance(chunk, bytes):
                    raise ValueError('Farside HTTP chunk was not bytes')
                size += len(chunk)
                if size > MAX_HTML_BYTES or time.monotonic() - started > 30:
                    raise ValueError('Farside HTTP response exceeded bounded size/time budget')
                parts.append(chunk)
            return b''.join(parts)
    raise RuntimeError('Farside HTTP retry budget exhausted')


def _schema(db):
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA busy_timeout=15000')
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('''CREATE TABLE IF NOT EXISTS etf_snapshots (
        id INTEGER PRIMARY KEY, source TEXT NOT NULL, observed_at TEXT NOT NULL,
        response_sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL,
        transport TEXT NOT NULL, row_count INTEGER NOT NULL,
        first_session TEXT NOT NULL, last_session TEXT NOT NULL,
        UNIQUE(source,observed_at))''')
    db.execute('''CREATE TABLE IF NOT EXISTS etf_revisions (
        source TEXT NOT NULL, session TEXT NOT NULL, payload_sha256 TEXT NOT NULL,
        first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        payload TEXT NOT NULL, PRIMARY KEY(source,session,payload_sha256))''')
    db.execute('''CREATE TABLE IF NOT EXISTS etf_observations (
        snapshot_id INTEGER NOT NULL REFERENCES etf_snapshots(id),
        source TEXT NOT NULL, session TEXT NOT NULL, payload_sha256 TEXT NOT NULL,
        observed_at TEXT NOT NULL, PRIMARY KEY(snapshot_id,session),
        FOREIGN KEY(source,session,payload_sha256)
            REFERENCES etf_revisions(source,session,payload_sha256))''')
    db.execute('''CREATE INDEX IF NOT EXISTS etf_by_session
                  ON etf_observations(source,session,observed_at DESC)''')


@contextmanager
def _writer_lock(database):
    """One writer per canonical database; lock is released on process termination."""
    target = Path(str(Path(database).resolve()) + '.writer.lock')
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('a+b') as handle:
        if not handle.read(1):
            handle.seek(0)
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def ingest_html(data: bytes, database=DEFAULT_DATABASE, *, observed_at=None, transport='manual_html') -> dict:
    if transport not in {'manual_html', 'public_http'}:
        raise ValueError('Unrecognized source transport')
    if not isinstance(data, bytes) or len(data) > MAX_HTML_BYTES:
        raise ValueError('Expected bounded byte-for-byte source HTML')
    rows = parse_farside_html(data)
    stamp = _timestamp(observed_at)
    when = _asof(observed_at).date()
    if rows[-1]['session'] > when.isoformat():
        raise ValueError('Source table contains future sessions relative to collection')
    fingerprint = _digest(data)
    path = Path(database)
    path.parent.mkdir(parents=True, exist_ok=True)
    new_versions = 0
    with _writer_lock(path), closing(sqlite3.connect(path)) as db:
        _schema(db)
        with db:
            existing = db.execute('''SELECT response_sha256 FROM etf_snapshots
                    WHERE source=? AND observed_at=?''', (SOURCE, stamp)).fetchone()
            if existing:
                if existing[0] != fingerprint:
                    raise ValueError('Conflicting source snapshots at same observation timestamp')
                return {'source': SOURCE, 'rows': len(rows), 'new_versions': 0, 'duplicate_snapshot': True,
                        'observed_at': stamp, 'response_sha256': fingerprint}
            snap = db.execute('''INSERT INTO etf_snapshots
                 (source,observed_at,response_sha256,byte_size,transport,row_count,first_session,last_session)
                 VALUES (?,?,?,?,?,?,?,?)''',
                 (SOURCE,stamp,fingerprint,len(data),transport,len(rows),rows[0]['session'],rows[-1]['session'])).lastrowid
            for row in rows:
                payload = json.dumps(row,sort_keys=True,separators=(',',':'),ensure_ascii=True)
                key = _digest(payload.encode())
                exists = db.execute('''SELECT 1 FROM etf_revisions
                    WHERE source=? AND session=? AND payload_sha256=?''',
                    (SOURCE,row['session'],key)).fetchone()
                db.execute('''INSERT INTO etf_revisions
                  (source,session,payload_sha256,first_seen_at,last_seen_at,payload)
                  VALUES (?,?,?,?,?,?) ON CONFLICT(source,session,payload_sha256)
                  DO UPDATE SET last_seen_at=excluded.last_seen_at''',
                  (SOURCE,row['session'],key,stamp,stamp,payload))
                db.execute('''INSERT INTO etf_observations
                  (snapshot_id,source,session,payload_sha256,observed_at)
                  VALUES (?,?,?,?,?)''', (snap,SOURCE,row['session'],key,stamp))
                new_versions += not bool(exists)
    return {'source': SOURCE, 'rows': len(rows), 'new_versions': new_versions,
            'duplicate_snapshot': False, 'observed_at': stamp, 'response_sha256': fingerprint,
            'first_session': rows[0]['session'], 'last_session': rows[-1]['session'],
            'historical_backtest_safe': False}


def _read_only(database):
    path = Path(database).resolve()
    if not path.is_file() or path.is_symlink():
        raise FileNotFoundError(f'ETF canonical SQLite not present: {path}')
    db = sqlite3.connect(path.as_uri() + '?mode=ro',uri=True)
    tables = {x[0] for x in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {'etf_snapshots','etf_revisions','etf_observations'} <= tables:
        db.close()
        raise ValueError('Not a canonical ETF Data Foundation database')
    return db


def rows_asof(database=DEFAULT_DATABASE, *, as_of=None, start=None, end=None) -> list[dict]:
    """Latest *actually observed* source version at cutoff, never a future edit."""
    at = _asof(as_of)
    lo = date.fromisoformat(start).isoformat() if start else FIRST_SESSION.isoformat()
    hi = date.fromisoformat(end).isoformat() if end else at.date().isoformat()
    if hi < lo or lo < FIRST_SESSION.isoformat():
        raise ValueError('Invalid ETF session date bounds')
    with closing(_read_only(database)) as db:
        cur = db.execute('''SELECT r.payload, o.observed_at, s.response_sha256, r.payload_sha256
            FROM etf_observations o
            JOIN etf_snapshots s ON s.id=o.snapshot_id
            JOIN etf_revisions r ON r.source=o.source AND r.session=o.session
                                AND r.payload_sha256=o.payload_sha256
            WHERE o.source=? AND o.session>=? AND o.session<=? AND o.observed_at<=?
            AND s.observed_at=o.observed_at
            AND o.rowid IN (SELECT i.id FROM (SELECT rowid AS id, session,
                ROW_NUMBER() OVER(PARTITION BY session ORDER BY observed_at DESC, rowid DESC) AS rn
                FROM etf_observations WHERE source=? AND session>=? AND session<=? AND observed_at<=?) i
                WHERE i.rn=1)
            ORDER BY o.session''', (SOURCE,lo,hi,_timestamp(at),SOURCE,lo,hi,_timestamp(at)))
        rows = []
        for payload, observed, snap_sha, hash_value in cur:
            row = json.loads(payload)
            if _digest(payload.encode()) != hash_value:
                raise ValueError('Canonical ETF row hash mismatch')
            row.update(observed_at=observed,source_sha256=snap_sha,payload_sha256=hash_value)
            rows.append(row)
        return rows


def status(database=DEFAULT_DATABASE, *, as_of=None) -> dict:
    with closing(_read_only(database)) as db:
        snaps,first_at,last_at = db.execute('''SELECT COUNT(*),MIN(observed_at),MAX(observed_at)
            FROM etf_snapshots WHERE source=?''', (SOURCE,)).fetchone()
        versions = db.execute('SELECT COUNT(*) FROM etf_revisions WHERE source=?', (SOURCE,)).fetchone()[0]
        revised = db.execute('''SELECT COUNT(*) FROM (SELECT session FROM etf_revisions
                   WHERE source=? GROUP BY session HAVING COUNT(*)>1)''', (SOURCE,)).fetchone()[0]
    rows = rows_asof(database, as_of=as_of)
    return {'schema_version': VERSION,'source':SOURCE, 'snapshots':snaps,
            'distinct_sessions':len(rows), 'revision_versions':versions,
            'revised_sessions':revised, 'first_observed_at':first_at, 'last_observed_at':last_at,
            'first_session':rows[0]['session'] if rows else None,
            'last_session':rows[-1]['session'] if rows else None,
            'reporting_states':dict(Counter(r['reporting_state'] for r in rows)),
            'historical_backtest_safe':False}


def quality_report(database=DEFAULT_DATABASE, *, as_of=None, start=None, end=None) -> dict:
    at_time = _asof(as_of)
    rows = rows_asof(database, as_of=at_time, start=start, end=end)
    at = _timestamp(at_time)
    good = [r for r in rows if r['reporting_state']=='REPORTED']
    unlabeled = [r for r in rows if r['reporting_state']=='NO_FUND_DATA']
    no_total = [r for r in rows if r['reporting_state']=='TOTAL_UNREPORTED']
    fund_obs = Counter()
    fund_missing = Counter()
    for row in rows:
        for fund, value in row['funds'].items():
            (fund_obs if value is not None else fund_missing)[fund] += 1
    return {
        'schema_version':VERSION,'kind':'etf_flows','source':SOURCE,
        'instrument':INSTRUMENT,'unit':UNIT,'as_of':at,
        'quality_gate':'pass' if good else 'fail',
        'historical_backtest_safe':False,'research_only':True,
        'summary':{'sessions':len(rows),'reported_sessions':len(good),
            'no_fund_data_sessions':len(unlabeled), 'total_unreported_sessions':len(no_total),
            'first_session':rows[0]['session'] if rows else None,
            'last_session':rows[-1]['session'] if rows else None,
            'per_fund_observed':dict(sorted(fund_obs.items())),
            'per_fund_missing':dict(sorted(fund_missing.items())),
            'latest_observed_at':max((r['observed_at'] for r in rows),default=None),
            'effective_source_sha256':_digest(json.dumps([r['payload_sha256'] for r in rows],separators=(',',':')).encode())},
        'warnings':['Missing fund cells and no-fund-data sessions are NOT zero flows.',
                    'Absence of a calendar session does not prove a zero-flow/closed day.',
                    'A retrospective webpage fetch does not provide historical information-release vintages.',
                    'Free-to-view data does not establish automatic scraping or redistribution permission.']
    }


def _sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for part in iter(lambda:f.read(1048576),b''):
            h.update(part)
    return h.hexdigest()


def _publish(output,producer):
    target=Path(output).resolve()
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        raise FileExistsError(f'Immutable ETF artifact already exists: {target}')
    with tempfile.TemporaryDirectory(prefix='.iris-etf-',dir=target.parent) as tmp:
        stage=Path(tmp)
        meta=producer(stage)
        (stage/'manifest.json').write_text(json.dumps(meta,indent=2,sort_keys=True)+'\n',encoding='utf-8')
        if target.exists():
            raise FileExistsError(f'Immutable ETF artifact already exists: {target}')
        os.rename(stage,target)
    return {'output':str(target),'sessions':meta['sessions'], 'quality_gate':meta['quality_gate'],
            'manifest_sha256':_sha(target/'manifest.json')}


def export_parquet(database, output, *, as_of=None, start=None, end=None) -> dict:
    from .warehouse import _duckdb, _sql_path
    report=quality_report(database,as_of=as_of,start=start,end=end)
    rows=rows_asof(database,as_of=as_of,start=start,end=end)
    if not rows:
        raise ValueError('Cannot export an empty ETF archive')
    duckdb=_duckdb()
    def build(stage):
        db=duckdb.connect(str(stage/'stage.duckdb'))
        path_total=stage/'daily_totals.parquet'
        path_funds=stage/'fund_flows.parquet'
        nfunds=0
        try:
            db.execute('''CREATE TABLE totals (session VARCHAR, total_usd_m DOUBLE,
                reporting_state VARCHAR, observed_at VARCHAR, source_sha256 VARCHAR)''')
            db.execute('''CREATE TABLE funds (session VARCHAR, ticker VARCHAR,
                flow_usd_m DOUBLE, value_state VARCHAR, observed_at VARCHAR,
                source_sha256 VARCHAR)''')
            batch_total,batch_fund=[],[]
            for row in rows:
                batch_total.append((row['session'],float(row['total_usd_m']) if row['total_usd_m'] is not None else None,
                                    row['reporting_state'],row['observed_at'],row['source_sha256']))
                for ticker,val in row['funds'].items():
                    batch_fund.append((row['session'],ticker,float(val) if val is not None else None,
                                       'reported' if val is not None else 'not_reported',
                                       row['observed_at'],row['source_sha256']))
                    nfunds+=1
            db.executemany('INSERT INTO totals VALUES (?,?,?,?,?)',batch_total)
            db.executemany('INSERT INTO funds VALUES (?,?,?,?,?,?)',batch_fund)
            db.execute(f'''COPY (SELECT * FROM totals ORDER BY session)
                TO {_sql_path(path_total)} (FORMAT PARQUET, COMPRESSION ZSTD)''')
            db.execute(f'''COPY (SELECT * FROM funds ORDER BY session,ticker)
                TO {_sql_path(path_funds)} (FORMAT PARQUET, COMPRESSION ZSTD)''')
        finally:
            db.close()
            for p in stage.glob('stage.duckdb*'):
                p.unlink()
        return {'schema_version':VERSION,'kind':'etf_flows','source':SOURCE,'instrument':INSTRUMENT,
                'unit':UNIT,'sessions':len(rows),'fund_rows':nfunds,
                'files':{'daily_totals.parquet':_sha(path_total),'fund_flows.parquet':_sha(path_funds)},
                'as_of':report['as_of'],'first_session':rows[0]['session'],'last_session':rows[-1]['session'],
                'quality_gate':report['quality_gate'],
                'effective_source_sha256':report['summary']['effective_source_sha256'],
                'generated_at':_timestamp(),'historical_backtest_safe':False,'research_only':True,
                'notice':'Private research only; source redistribution rights not established.'}
    return _publish(output,build)


def verify_parquet(artifact) -> dict:
    from .warehouse import _duckdb, _sql_path
    folder=Path(artifact).resolve()
    meta=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if (meta.get('schema_version')!=VERSION or meta.get('kind')!='etf_flows'
        or meta.get('source')!=SOURCE or meta.get('unit')!=UNIT
        or meta.get('historical_backtest_safe') is not False
        or set(meta.get('files',{}))!={'daily_totals.parquet','fund_flows.parquet'}):
        raise ValueError('Invalid ETF Parquet manifest identity')
    db=_duckdb().connect(':memory:')
    try:
        expected={'daily_totals.parquet':['session','total_usd_m','reporting_state','observed_at','source_sha256'],
                  'fund_flows.parquet':['session','ticker','flow_usd_m','value_state','observed_at','source_sha256']}
        for name,digest in meta['files'].items():
            path=folder/name
            if not path.is_file() or path.is_symlink() or not re.fullmatch(r'[0-9a-f]{64}',str(digest)):
                raise ValueError('Missing/symlinked or malformed ETF Parquet')
            if _sha(path)!=digest:
                raise ValueError('ETF Parquet SHA256 mismatch')
            columns=[row[0] for row in db.execute(f'DESCRIBE SELECT * FROM read_parquet({_sql_path(path)})').fetchall()]
            if columns!=expected[name]:
                raise ValueError('ETF Parquet schema mismatch')
        a=db.execute('''SELECT COUNT(*),COUNT(DISTINCT session),
            SUM(CASE WHEN reporting_state NOT IN ('REPORTED','NO_FUND_DATA','TOTAL_UNREPORTED')
                OR (reporting_state='REPORTED' AND total_usd_m IS NULL)
                OR (reporting_state='NO_FUND_DATA' AND total_usd_m IS NOT NULL AND total_usd_m!=0)
                THEN 1 ELSE 0 END) FROM read_parquet(?)''', [str(folder/'daily_totals.parquet')]).fetchone()
        b=db.execute('''SELECT COUNT(*),COUNT(DISTINCT (session,ticker)),
            SUM(CASE WHEN (value_state='not_reported' AND flow_usd_m IS NOT NULL)
                 OR (value_state='reported' AND (flow_usd_m IS NULL OR NOT isfinite(flow_usd_m)))
                 OR value_state NOT IN ('reported','not_reported') THEN 1 ELSE 0 END)
            FROM read_parquet(?)''',[str(folder/'fund_flows.parquet')]).fetchone()
        if (a[0]!=meta['sessions'] or a[1]!=a[0] or a[2]
            or b[0]!=meta['fund_rows'] or b[1]!=b[0] or b[2]):
            raise ValueError('ETF Parquet row-count, uniqueness or state integrity mismatch')
    finally:
        db.close()
    return {'verified':True,'kind':'etf_flows','source':SOURCE,'sessions':a[0],
            'fund_rows':b[0],'quality_gate':meta['quality_gate'],'historical_backtest_safe':False}


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    imp=sub.add_parser('import',help='Import a manually saved public Farside HTML page')
    imp.add_argument('--input',type=Path,required=True)
    live=sub.add_parser('fetch',help='Opt-in one bounded public HTTP request (no API key or bypass)')
    for cmd in (imp,live):
        cmd.add_argument('--database',type=Path,default=DEFAULT_DATABASE)
        cmd.add_argument('--output',type=Path,help='Create report JSON, never overwrite')
    status_p=sub.add_parser('status',help='Inspect canonical observed sessions and revisions')
    status_p.add_argument('--database',type=Path,default=DEFAULT_DATABASE)
    status_p.add_argument('--as-of')
    report_p=sub.add_parser('quality',help='Report observed ETF completeness and missing values')
    exp=sub.add_parser('export',help='Immutable ZSTD Parquet snapshots for bounded research')
    for cmd in (report_p,exp):
        cmd.add_argument('--database',type=Path,default=DEFAULT_DATABASE)
        cmd.add_argument('--as-of')
        cmd.add_argument('--start')
        cmd.add_argument('--end')
        cmd.add_argument('--output',type=Path,required=True)
    check=sub.add_parser('verify',help='Verify ETF Parquet schema/hashes/nullable values')
    check.add_argument('--artifact',type=Path,required=True)
    args=p.parse_args(argv)
    if args.command=='import':
        raw=args.input.read_bytes()
        result=ingest_html(raw,args.database,transport='manual_html')
    elif args.command=='fetch':
        result=ingest_html(fetch_public_html(),args.database,transport='public_http')
    elif args.command=='status':
        result=status(args.database,as_of=args.as_of)
    elif args.command=='quality':
        result=quality_report(args.database,as_of=args.as_of,start=args.start,end=args.end)
    elif args.command=='export':
        result=export_parquet(args.database,args.output,as_of=args.as_of,start=args.start,end=args.end)
    else:
        result=verify_parquet(args.artifact)
    if getattr(args,'output',None) and args.command in {'import','fetch','quality'}:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open('x',encoding='utf-8') as file:
            json.dump(result,file,indent=2,ensure_ascii=False)
            file.write('\n')
    print(json.dumps(result,indent=2,ensure_ascii=False))
    return 0 if result.get('quality_gate','pass')!='fail' else 1


if __name__=='__main__':
    raise SystemExit(main())
