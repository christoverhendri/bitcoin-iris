"""Local append-only observations from verified free-source CSV artifacts.

An ingested retrospective snapshot is NOT historical point-in-time evidence:
its observed_at is the local extraction time, never the metric period date.
"""
from __future__ import annotations

import argparse
import csv
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import sqlite3

from .point_in_time import utc_time, value_at_origin

SOURCE = 'coinmetrics-community'
FIELDS = ('date', 'metric', 'value', 'state', 'observed_at')
STATES = {'observed', 'missing_day', 'missing_metric'}
MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
DEFAULT_DB = Path('artifacts/market/observations.sqlite')


def _schema(db):
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('''CREATE TABLE IF NOT EXISTS observations (
        source TEXT NOT NULL, metric TEXT NOT NULL, day TEXT NOT NULL,
        observed_at TEXT NOT NULL, value TEXT, state TEXT NOT NULL,
        snapshot_sha256 TEXT NOT NULL,
        PRIMARY KEY(source, metric, day, observed_at))''')
    db.execute('''CREATE INDEX IF NOT EXISTS obs_lookup
                  ON observations(source, metric, day DESC, observed_at DESC)''')
    db.execute('''CREATE TABLE IF NOT EXISTS snapshots (
        data_sha256 TEXT PRIMARY KEY, source TEXT NOT NULL,
        observed_at TEXT NOT NULL, first_day TEXT NOT NULL, end_exclusive TEXT NOT NULL,
        row_count INTEGER NOT NULL, inserted_at TEXT NOT NULL)''')


def _validate_manifest(manifest: dict, content: bytes):
    if not isinstance(manifest, dict) or manifest.get('source') != SOURCE:
        raise ValueError('Artifact is not a Coin Metrics Community export')
    sha = hashlib.sha256(content).hexdigest()
    if manifest.get('data_sha256') != sha:
        raise ValueError('Artifact SHA-256 mismatch; source or manifest changed')
    if manifest.get('historical_backtest_safe') is not False:
        raise ValueError('Historical availability must not be claimed')
    at = utc_time(manifest.get('observed_at'))
    first = date.fromisoformat(manifest['requested_start'])
    last = date.fromisoformat(manifest['requested_end_exclusive'])
    if first >= last or last > at.date():
        raise ValueError('Invalid source date coverage or unfinished UTC day')
    metrics = manifest.get('metrics')
    if not isinstance(metrics, list) or not metrics or len(metrics) > 12 or any(
        not isinstance(m, str) or not m.isalnum() or not m[0].isalpha() for m in metrics
    ) or len(set(metrics)) != len(metrics):
        raise ValueError('Invalid metric list in source manifest')
    count = manifest.get('row_count')
    expected = (last - first).days * len(metrics)
    if not isinstance(count, int) or isinstance(count, bool) or count != expected:
        raise ValueError('Unexpected source row count')
    return sha, at, first, last, set(metrics)


def ingest_artifact(folder: str | Path, database: str | Path = DEFAULT_DB) -> dict:
    """Atomically ingest a validated artifact, keeping future revisions separate.

    The manifest proves local file integrity, NOT that source-provided historical
    data was already publicly known at its measurement date. Only trust artifacts
    produced by your own collector and protected from local modification.
    """
    folder = Path(folder)
    data_file = folder / 'onchain_daily.csv'
    if data_file.stat().st_size > MAX_ARTIFACT_BYTES:
        raise ValueError('Artifact exceeds local size budget')
    content = data_file.read_bytes()
    manifest = json.loads((folder / 'provenance.json').read_text(encoding='utf-8'))
    sha, at, first, last, metrics = _validate_manifest(manifest, content)
    at_iso = at.isoformat()
    import io
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig'), newline=''))
    if reader.fieldnames != list(FIELDS):
        raise ValueError('Unexpected source CSV header')

    db_path = Path(database)
    if db_path.resolve() in (data_file.resolve(), (folder / 'provenance.json').resolve()):
        raise ValueError('Database path would overwrite the source artifact')
    db_path.parent.mkdir(parents=True, exist_ok=True)
    inserted = 0
    rows = 0
    with closing(sqlite3.connect(db_path, timeout=10)) as db:
        _schema(db)
        with db:  # all data rows and the snapshot checkpoint commit together
            for row in reader:
                rows += 1
                if rows > manifest['row_count']:
                    raise ValueError('Artifact has extra rows')
                if row.get('metric') not in metrics or row.get('state') not in STATES:
                    raise ValueError('Invalid metric or missingness state')
                day = date.fromisoformat(row['date'])
                if day.isoformat() != row['date'] or not first <= day < last or row['observed_at'] != manifest['observed_at']:
                    raise ValueError('Invalid source day or observation timestamp')
                value = row['value']
                state = row['state']
                if state == 'observed':
                    if not value or len(value) > 128:
                        raise ValueError('Observed metric must have a bounded value')
                    try:
                        numeric = Decimal(value)
                    except InvalidOperation as exc:
                        raise ValueError('Invalid source metric') from exc
                    if not numeric.is_finite() or abs(numeric.adjusted()) > 100:
                        raise ValueError('Nonfinite or out-of-range metric')
                elif value:
                    raise ValueError('Missing metric may not include an invented value')
                existing = db.execute('''SELECT value,state,snapshot_sha256 FROM observations
                    WHERE source=? AND metric=? AND day=? AND observed_at=?''',
                    (SOURCE, row['metric'], row['date'], at_iso)).fetchone()
                if existing:
                    if existing != (value or None, state, sha):
                        raise ValueError('Conflicting same-timestamp snapshot revision')
                    continue
                db.execute('''INSERT INTO observations
                    (source,metric,day,observed_at,value,state,snapshot_sha256)
                    VALUES (?,?,?,?,?,?,?)''',
                    (SOURCE, row['metric'], row['date'], at_iso, value or None, state, sha))
                inserted += 1
            if rows != manifest['row_count']:
                raise ValueError('Artifact missing expected rows')
            old = db.execute('SELECT source,observed_at,row_count FROM snapshots WHERE data_sha256=?', (sha,)).fetchone()
            if old:
                if old != (SOURCE, at_iso, rows):
                    raise ValueError('Conflicting snapshot metadata for identical CSV')
            else:
                db.execute('''INSERT INTO snapshots VALUES (?,?,?,?,?,?,?)''',
                           (sha, SOURCE, at_iso, first.isoformat(), last.isoformat(), rows,
                            datetime.now(timezone.utc).isoformat()))
    return {'inserted': inserted, 'rows': rows, 'sha256': sha, 'database': str(db_path)}


def query_at_origin(database: str | Path, metric: str, origin: str,
                    max_age_days: int = 2) -> dict:
    """Return a point-in-time observation, never an unreleased future revision."""
    as_of = utc_time(origin)
    if not Path(database).is_file():
        raise FileNotFoundError('Observation store does not exist; import an artifact first')
    with closing(sqlite3.connect(database)) as db:
        _schema(db)
        rows = db.execute('''SELECT day,metric,value,state,observed_at FROM observations
            WHERE source=? AND metric=? AND observed_at<=? AND day<=?
            ORDER BY day DESC, observed_at DESC''',
            (SOURCE, metric, as_of.isoformat(), as_of.date().isoformat())).fetchall()
    return value_at_origin((dict(date=d, metric=m, value=v, state=s, observed_at=o)
                            for d, m, v, s, o in rows), metric, as_of, max_age_days=max_age_days)


def quality_status(database: str | Path) -> dict:
    """Report observed/missing rows without ever filling a gap with zero."""
    if not Path(database).is_file():
        raise FileNotFoundError('Observation store does not exist; import an artifact first')
    with closing(sqlite3.connect(database)) as db:
        _schema(db)
        counts = dict(db.execute('SELECT state,COUNT(*) FROM observations GROUP BY state').fetchall())
        by_metric = [dict(metric=m, state=s, count=n) for m, s, n in db.execute(
            'SELECT metric,state,COUNT(*) FROM observations GROUP BY metric,state ORDER BY metric,state')]
        observed = db.execute('SELECT MAX(observed_at) FROM observations').fetchone()[0]
        snapshots = db.execute('SELECT COUNT(*) FROM snapshots').fetchone()[0]
    return {'source': SOURCE, 'snapshot_count': snapshots, 'row_states': counts,
            'by_metric': by_metric, 'last_seen_at': observed, 'historical_backtest_safe': False}


def main(argv=None):
    p = argparse.ArgumentParser(description='Append-only free on-chain observations (research only)')
    p.add_argument('--database', type=Path, default=DEFAULT_DB)
    sub = p.add_subparsers(dest='command', required=True)
    imp = sub.add_parser('import', help='Import an immutable Coin Metrics CSV artifact')
    imp.add_argument('--artifact', type=Path, required=True)
    at = sub.add_parser('as-of', help='Query only observations available at the origin')
    at.add_argument('--metric', required=True)
    at.add_argument('--origin', required=True)
    at.add_argument('--max-age-days', type=int, default=2)
    sub.add_parser('status')
    args = p.parse_args(argv)
    if args.command == 'import':
        out = ingest_artifact(args.artifact, args.database)
    elif args.command == 'as-of':
        out = query_at_origin(args.database, args.metric, args.origin, args.max_age_days)
    else:
        out = quality_status(args.database)
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
