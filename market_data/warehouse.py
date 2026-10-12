"""Optional DuckDB/Parquet read-model of canonical SQLite and Coinbase artifacts.

SQLite and original CSVs remain authorities. Outputs are immutable, verified
snapshots for analytics; exporting history never manufactures observation times.
Install `requirements-warehouse.txt` only for these commands.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import tempfile
from contextlib import closing

from .observation_store import DEFAULT_DB, SOURCE, STATES
from .point_in_time import utc_time, value_at_origin

VERSION = 'iris-warehouse/v1'
SCHEMAS = {
    'onchain': 'observations.parquet',
    'prices': 'prices.parquet',
    'prices_hourly': 'hourly.parquet',
}
MAX_ROWS = 2_000_000
MAX_PRICE_CSV_BYTES = 128 * 1024 * 1024


def _duckdb():
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError('Optional DuckDB missing: pip install -r requirements-warehouse.txt') from exc
    return duckdb


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def _sql_path(path: Path) -> str:
    """Quote local COPY destination, never interpolate a source-controlled URL."""
    return "'" + str(path.resolve()).replace("'", "''") + "'"


def _publish(output: Path, producer):
    """Build into a sibling directory; publish only a complete immutable snapshot."""
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(f'Warehouse output already exists: {output}')
    with tempfile.TemporaryDirectory(prefix='.iris-warehouse-', dir=output.parent) as tmp:
        stage = Path(tmp)
        manifest = producer(stage)
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        # A failed export leaves the previous canonical data untouched.
        if output.exists():
            raise FileExistsError(f'Warehouse output already exists: {output}')
        os.rename(stage, output)
    return {'output': str(output), 'rows': manifest['row_count'], 'sha256': manifest['data_sha256'], 'kind': manifest['kind']}


def export_onchain(database: str | Path, output: str | Path) -> dict:
    """Export every revision and missingness state, not only the latest value."""
    database = Path(database).resolve()
    if not database.is_file():
        raise FileNotFoundError(f'Canonical SQLite database not found: {database}')
    if not set(('observations', 'snapshots')).issubset(_sqlite_tables(database)):
        raise ValueError('Not a canonical market-data SQLite database')
    duckdb = _duckdb()

    def make(stage: Path):
        target = stage / SCHEMAS['onchain']
        con = duckdb.connect(str(stage / 'stage.duckdb'))
        count = 0
        try:
            con.execute('''CREATE TABLE observations (
                source VARCHAR, metric VARCHAR, day VARCHAR, observed_at VARCHAR,
                value VARCHAR, state VARCHAR, snapshot_sha256 VARCHAR)''')
            # BEGIN creates a consistent source snapshot while a collector may write.
            with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as src:
                src.execute('BEGIN')
                cursor = src.execute('''SELECT source,metric,day,observed_at,value,state,snapshot_sha256
                    FROM observations ORDER BY day,metric,observed_at''')
                while True:
                    batch = cursor.fetchmany(5000)
                    if not batch:
                        break
                    count += len(batch)
                    if count > MAX_ROWS:
                        raise ValueError('Exceeds maximum warehouse rows; partition by interval instead')
                    for row in batch:
                        source, metric, day, stamp, value, state, fingerprint = row
                        if (source != SOURCE or not isinstance(metric, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,63}', metric)
                            or not isinstance(day, str) or date.fromisoformat(day).isoformat() != day
                            or utc_time(stamp).isoformat() != stamp or state not in STATES
                            or not isinstance(fingerprint, str) or not re.fullmatch(r'[0-9a-f]{64}', fingerprint)):
                            raise ValueError('Invalid canonical observation row')
                        if state == 'observed':
                            try:
                                numeric = Decimal(value)
                            except (InvalidOperation, ValueError, TypeError) as exc:
                                raise ValueError('Invalid observed value in canonical database') from exc
                            if not numeric.is_finite():
                                raise ValueError('Nonfinite canonical observation')
                        elif value is not None:
                            raise ValueError('Missingness state must have null value')
                    con.executemany('INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?)', batch)
                src.rollback()
            if count == 0:
                raise ValueError('No canonical observations to export')
            con.execute(f'''COPY (SELECT * FROM observations ORDER BY day,metric,observed_at)
                TO {_sql_path(target)} (FORMAT PARQUET, COMPRESSION ZSTD)''')
        finally:
            con.close()
            # Do not publish a second DuckDB database alongside the Parquet.
            for candidate in stage.glob('stage.duckdb*'):
                candidate.unlink()
        return {'schema_version': VERSION, 'kind': 'onchain', 'row_count': count,
                'source': SOURCE, 'data_file': SCHEMAS['onchain'], 'data_sha256': _sha256(target),
                'exported_at': datetime.now(timezone.utc).isoformat(),
                'time_basis': 'local_observed_at', 'historical_backtest_safe': False,
                'canonical_store': 'SQLite observations (all retained versions, including missing states)',
                'warning': 'Historical backfills are NOT historically observable before actual ingestion.'}
    return _publish(Path(output), make)


def _sqlite_tables(database: Path) -> set[str]:
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as con:
        return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _finite(value: str, field: str, positive: bool) -> float:
    try:
        out = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f'Invalid Coinbase {field}') from exc
    if not math.isfinite(out) or (out <= 0 if positive else out < 0):
        raise ValueError(f'Invalid Coinbase {field}')
    return out


def export_prices(artifact: str | Path, output: str | Path) -> dict:
    """Convert the already-validated Coinbase CSV into a provenance-bound read model."""
    folder = Path(artifact).resolve()
    csv_path = folder / 'prices.csv'
    meta_path = folder / 'provenance.json'
    if not csv_path.is_file() or not meta_path.is_file():
        raise FileNotFoundError('Coinbase prices.csv and provenance.json required')
    if csv_path.stat().st_size > MAX_PRICE_CSV_BYTES:
        raise ValueError('Price CSV exceeds size budget')
    manifest = json.loads(meta_path.read_text(encoding='utf-8'))
    if not isinstance(manifest, dict) or manifest.get('source') != 'coinbase-exchange' or manifest.get('venue') != 'coinbase-exchange' or manifest.get('instrument') != 'BTC/USD':
        raise ValueError('Expected official Coinbase BTC/USD artifact')
    csv_sha = _sha256(csv_path)
    if manifest.get('data_sha256') != csv_sha:
        raise ValueError('Coinbase CSV and provenance SHA-256 mismatch')
    first = date.fromisoformat(manifest['requested_start'])
    cutoff = utc_time(manifest['requested_end_exclusive'])
    if first >= cutoff.date():
        raise ValueError('Invalid Coinbase requested interval')
    fetched = utc_time(manifest['fetched_at'])
    if fetched.date() < cutoff.date():
        raise ValueError('Price artifact cannot predate its end cutoff')
    duckdb = _duckdb()

    def make(stage: Path):
        target = stage / SCHEMAS['prices']
        con = duckdb.connect(str(stage / 'stage.duckdb'))
        count = 0
        try:
            con.execute('''CREATE TABLE prices (
                date VARCHAR, Low DOUBLE, High DOUBLE, Open DOUBLE, Close DOUBLE, Volume DOUBLE)''')
            with csv_path.open('r', encoding='utf-8-sig', newline='') as inp:
                rdr = csv.DictReader(inp)
                if rdr.fieldnames != ['date', 'Low', 'High', 'Open', 'Close', 'Volume']:
                    raise ValueError('Unexpected Coinbase CSV columns')
                batch = []
                for row in rdr:
                    count += 1
                    if count > MAX_ROWS:
                        raise ValueError('Too many price rows')
                    day = date.fromisoformat(row['date'])
                    if day != first + timedelta(days=count - 1) or day >= cutoff.date():
                        raise ValueError('Coinbase daily bars contain gaps, duplicates or out-of-order dates')
                    low, high, opening, close = (_finite(row[name], name, True) for name in ('Low', 'High', 'Open', 'Close'))
                    volume = _finite(row['Volume'], 'Volume', False)
                    if low > min(opening, close) or high < max(opening, close) or low > high:
                        raise ValueError(f'Inconsistent Coinbase OHLC at {day}')
                    batch.append((day.isoformat(), low, high, opening, close, volume))
                    if len(batch) >= 5000:
                        con.executemany('INSERT INTO prices VALUES (?, ?, ?, ?, ?, ?)', batch)
                        batch.clear()
                if batch:
                    con.executemany('INSERT INTO prices VALUES (?, ?, ?, ?, ?, ?)', batch)
            if count != (cutoff.date() - first).days:
                raise ValueError('Incomplete Coinbase candle history')
            con.execute(f'''COPY (SELECT * FROM prices ORDER BY date)
                TO {_sql_path(target)} (FORMAT PARQUET, COMPRESSION ZSTD)''')
        finally:
            con.close()
            for candidate in stage.glob('stage.duckdb*'):
                candidate.unlink()
        info = {'schema_version': VERSION, 'kind': 'prices', 'row_count': count,
                'source': 'coinbase-exchange', 'venue': 'coinbase-exchange', 'instrument': 'BTC/USD',
                'source_csv_sha256': csv_sha, 'source_fetched_at': fetched.isoformat(),
                'data_file': SCHEMAS['prices'], 'data_sha256': _sha256(target),
                'exported_at': datetime.now(timezone.utc).isoformat(),
                'first_day': first.isoformat(), 'end_exclusive': cutoff.isoformat(),
                'available_at_assumption': 'UTC daily close usable at following 00:00 UTC; vendor latency not verified',
                'historical_backtest_safe': False}
        (stage / 'provenance.json').write_text(json.dumps(info, sort_keys=True, indent=2) + '\n', encoding='utf-8')
        return info
    return _publish(Path(output), make)


def verify_export(artifact: str | Path) -> dict:
    folder = Path(artifact).resolve()
    meta = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    if (not isinstance(meta, dict) or meta.get('schema_version') != VERSION
        or meta.get('kind') not in SCHEMAS or meta.get('historical_backtest_safe') is not False
        or meta.get('data_file') != SCHEMAS[meta['kind']]):
        raise ValueError('Unknown or untrusted warehouse manifest')
    path = folder / meta['data_file']
    if not path.is_file() or path.is_symlink() or not re.fullmatch(r'[0-9a-f]{64}', str(meta.get('data_sha256', ''))):
        raise ValueError('Missing or invalid warehouse Parquet')
    if _sha256(path) != meta['data_sha256']:
        raise ValueError('Warehouse Parquet SHA-256 mismatch')
    duckdb = _duckdb()
    with closing(duckdb.connect(':memory:')) as con:
        count = con.execute('SELECT count(*) FROM read_parquet(?)', [str(path)]).fetchone()[0]
        names = [r[0] for r in con.execute(f'DESCRIBE SELECT * FROM read_parquet({_sql_path(path)})').fetchall() if r[0] != 'filename']
    expected = {
        'onchain': ['source', 'metric', 'day', 'observed_at', 'value', 'state', 'snapshot_sha256'],
        'prices': ['date', 'Low', 'High', 'Open', 'Close', 'Volume'],
        'prices_hourly': ['ts', 'Low', 'High', 'Open', 'Close', 'Volume', 'observed_at', 'payload_sha256'],
    }[meta['kind']]
    if names != expected or count != meta.get('row_count'):
        raise ValueError('Warehouse Parquet schema or row count mismatch')
    if meta['kind'] == 'prices':
        provenance = json.loads((folder / 'provenance.json').read_text(encoding='utf-8'))
        if provenance != meta:
            raise ValueError('Price provenance and manifest mismatch')
    return {'kind': meta['kind'], 'rows': count, 'verified': True,
            'data_sha256': meta['data_sha256'], 'historical_backtest_safe': False}


def query_onchain(artifact: str | Path, metric: str, origin: str, *, max_age_days: int = 2) -> dict:
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,63}', metric):
        raise ValueError('Invalid metric')
    as_of = utc_time(origin)
    if verify_export(artifact)['kind'] != 'onchain':
        raise ValueError('Expected onchain warehouse')
    path = Path(artifact).resolve() / SCHEMAS['onchain']
    with closing(_duckdb().connect(':memory:')) as con:
        match = con.execute('''SELECT day, metric, value, state, observed_at
            FROM read_parquet(?) WHERE source=? AND metric=? AND state='observed'
            AND day < ? AND observed_at <= ?
            ORDER BY day DESC, observed_at DESC LIMIT 1''',
            [str(path), SOURCE, metric, as_of.date().isoformat(), as_of.isoformat()]).fetchone()
    rows = ([dict(date=match[0], metric=match[1], value=match[2], state=match[3], observed_at=match[4])]
            if match is not None else [])
    return value_at_origin(rows, metric, as_of, max_age_days=max_age_days)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Optional immutable Parquet + DuckDB analytics layer')
    commands = parser.add_subparsers(dest='command', required=True)
    oc = commands.add_parser('onchain', help='Export canonical SQLite observations to Parquet')
    oc.add_argument('--database', type=Path, default=DEFAULT_DB)
    oc.add_argument('--output', type=Path, required=True)
    pr = commands.add_parser('prices', help='Export verified Coinbase CSV to Parquet')
    pr.add_argument('--artifact', type=Path, required=True)
    pr.add_argument('--output', type=Path, required=True)
    vf = commands.add_parser('verify', help='Verify immutable warehouse schema, rows and hash')
    vf.add_argument('--artifact', type=Path, required=True)
    at = commands.add_parser('as-of', help='Point-in-time onchain query over Parquet')
    at.add_argument('--artifact', type=Path, required=True)
    at.add_argument('--metric', required=True)
    at.add_argument('--origin', required=True)
    at.add_argument('--max-age-days', type=int, default=2)
    args = parser.parse_args(argv)
    if args.command == 'onchain':
        result = export_onchain(args.database, args.output)
    elif args.command == 'prices':
        result = export_prices(args.artifact, args.output)
    elif args.command == 'verify':
        result = verify_export(args.artifact)
    else:
        result = query_onchain(args.artifact, args.metric, args.origin, max_age_days=args.max_age_days)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
