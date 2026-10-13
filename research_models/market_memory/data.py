"""Read immutable hourly snapshots without changing the canonical data store.

A stored hash binds local bytes, not an exchange's identity or historical release
vintage. SQLite last_seen is mutable: this reader deliberately DOES NOT offer a
historical source-as-of reconstruction. All experiments require retrospective
acknowledgement and distinguish source observation from candle completion.
"""
from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3

import numpy as np

HOUR = 3600
DAY = 24 * HOUR
MAX_ROWS = 250_000
MAX_BYTES = 512 * 1024 * 1024
IDENTITY = {'source': 'coinbase-exchange', 'instrument': 'BTC/USD',
            'granularity_seconds': '3600'}


def utc_seconds(value: str) -> int:
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError('Expected a timezone-aware ISO timestamp') from exc
    if dt.tzinfo is None:
        raise ValueError('Timestamp requires an explicit timezone')
    return int(dt.timestamp())


def iso(ts: int | float) -> str:
    return datetime.fromtimestamp(int(ts), timezone.utc).isoformat().replace('+00:00', 'Z')


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def payload_hash(ts: int, values) -> str:
    # Same numeric serialization as market_data.hourly_prices.backfill.
    return hashlib.sha256(json.dumps([int(ts), *map(float, values)],
                          separators=(',', ':'), allow_nan=False).encode()).hexdigest()


@dataclass(frozen=True)
class HourlyData:
    ts: np.ndarray
    ohlcv: np.ndarray  # Low, High, Open, Close, Volume
    observed: np.ndarray
    provenance: dict


def _validated(rows: list, metadata: dict) -> HourlyData:
    if not rows or len(rows) > MAX_ROWS:
        raise ValueError('Source must contain 1..250000 hourly observations')
    times, values, observed = [], [], []
    digest = hashlib.sha256()
    previous = -1
    for ts, low, high, opening, close, volume, obs, sha in rows:
        if isinstance(ts, bool) or not isinstance(ts, int) or ts % HOUR or ts <= previous:
            raise ValueError('Source timestamps must be unique, sorted UTC hours')
        if any(isinstance(x, bool) or not isinstance(x, (int, float))
               for x in (low, high, opening, close, volume)):
            raise ValueError('Source values must be numeric, not null or strings')
        v = np.asarray([low, high, opening, close, volume], dtype=float)
        if (not np.all(np.isfinite(v)) or min(v[:4]) <= 0 or volume < 0
                or low > min(opening, close) or high < max(opening, close)):
            raise ValueError('Invalid OHLCV or missing source value')
        ot = utc_seconds(obs)
        if ts + HOUR > ot:
            raise ValueError('Hourly candle observed before its completion')
        if not isinstance(sha, str) or payload_hash(ts, v) != sha:
            raise ValueError('Candle payload SHA-256 mismatch')
        digest.update(json.dumps([ts, sha, obs], separators=(',', ':')).encode() + b'\n')
        times.append(ts)
        values.append(v)
        observed.append(ot)
        previous = ts
    meta = dict(metadata, source=IDENTITY['source'], instrument=IDENTITY['instrument'],
                granularity_seconds=HOUR, effective_sha256=digest.hexdigest(),
                source_hours=len(rows), first_candle_start=iso(times[0]),
                last_candle_start=iso(times[-1]), first_observed_at=iso(min(observed)),
                last_observed_at=iso(max(observed)), historical_backtest_safe=False,
                integrity='pass', historical_vintage='not_reconstructed')
    return HourlyData(np.array(times, dtype=np.int64), np.array(values),
                      np.array(observed, dtype=np.int64), meta)


def read_sqlite(path: str | Path) -> HourlyData:
    p = Path(path)
    if p.is_symlink() or not p.is_file() or p.stat().st_size > MAX_BYTES:
        raise ValueError('Expected a regular, bounded canonical SQLite file')
    wal = Path(str(p) + '-wal')
    if wal.exists() and p.stat().st_size + wal.stat().st_size > MAX_BYTES:
        raise ValueError('SQLite plus WAL exceeds the research read budget')
    with closing(sqlite3.connect(p.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        for table in ('hourly_candles', 'hourly_windows', 'store_identity'):
            if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                raise ValueError('Missing canonical hourly table')
        identity = dict(db.execute('SELECT key,value FROM store_identity'))
        if any(identity.get(k) != v for k, v in IDENTITY.items()):
            raise ValueError('Expected canonical Coinbase BTC/USD 1h identity')
        # An ambiguous revision must not be selected by hash ordering.
        ambiguous = db.execute('''WITH latest AS (
          SELECT ts,MAX(julianday(last_seen_at)) AS seen FROM hourly_candles GROUP BY ts)
          SELECT c.ts FROM hourly_candles c JOIN latest l ON c.ts=l.ts
          AND julianday(c.last_seen_at)=l.seen GROUP BY c.ts HAVING COUNT(*)>1 LIMIT 1''').fetchone()
        if ambiguous:
            raise ValueError('Ambiguous same-time revisions in hourly source')
        count, invalid_dates = db.execute('''SELECT COUNT(*),SUM(CASE WHEN
          julianday(last_seen_at) IS NULL OR julianday(observed_at) IS NULL OR
          julianday(last_seen_at)<julianday(observed_at) THEN 1 ELSE 0 END)
          FROM hourly_candles''').fetchone()
        if count > MAX_ROWS * 8 or invalid_dates:
            raise ValueError('Invalid revision timestamps or excessive revision count')
        rows = db.execute('''SELECT ts,low,high,open,close,volume,observed_at,payload_sha256
          FROM (SELECT *,ROW_NUMBER() OVER (PARTITION BY ts ORDER BY
          julianday(last_seen_at) DESC,payload_sha256) AS rn FROM hourly_candles)
          WHERE rn=1 ORDER BY ts LIMIT ?''', (MAX_ROWS + 1,)).fetchall()
        last_seen = db.execute('SELECT MAX(julianday(last_seen_at)) FROM hourly_candles').fetchone()[0]
        db.rollback()
    return _validated(rows, {'input_kind': 'canonical_sqlite',
                            'revision_rows': count,
                            'latest_seen_julian': last_seen,
                            'snapshot_scope': 'latest effective versions; not historical as-of'})


def read_warehouse(folder: str | Path) -> HourlyData:
    # Reuse IRIS's existing verifier; gaps do not bypass integrity checks.
    from market_data.hourly_prices import verify_hourly
    import duckdb
    p = Path(folder)
    for name in ('manifest.json', 'hourly.parquet'):
        f = p / name
        if f.is_symlink() or not f.is_file() or f.stat().st_size > MAX_BYTES:
            raise ValueError('Expected bounded, regular hourly warehouse files')
    checked = verify_hourly(p)
    with duckdb.connect(':memory:') as db:
        db.execute("SET memory_limit='128MB'")
        db.execute('SET threads=1')
        rows = db.execute('''SELECT ts,Low,High,Open,Close,Volume,observed_at,payload_sha256
          FROM read_parquet(?) ORDER BY ts LIMIT ?''',
          [str(p / 'hourly.parquet'), MAX_ROWS + 1]).fetchall()
    if digest_file(p / 'hourly.parquet') != checked['data_sha256']:
        raise ValueError('Hourly warehouse changed during read')
    return _validated(rows, {'input_kind': 'verified_hourly_parquet',
                            'input_sha256': checked['data_sha256'],
                            'archive_quality_gate': checked['quality_gate'],
                            'snapshot_scope': 'immutable retrospective export'})
