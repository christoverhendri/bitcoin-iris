"""Repeatable onchain SQLite vs DuckDB/Parquet *read* benchmark.

The same dated metric/as-of workload is evaluated against both stores and
results are compared BEFORE any timing is reported. Does not benchmark writes,
network latency, end-to-end forecasting, or promise that DuckDB is faster.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sqlite3
from statistics import median
from time import perf_counter_ns

from .point_in_time import utc_time
from .warehouse import _duckdb, _sql_path, verify_export

VERSION = 'iris-warehouse-benchmark/v1'


def _number(value):
    return None if value is None else float(value)


def _result_equivalent(a, b):
    if a is None or b is None:
        return a is None and b is None
    if len(a) != len(b):
        return False
    return all((x == y if not isinstance(x, (int, float)) or not isinstance(y, (int, float))
                else math.isclose(float(x), float(y), rel_tol=1e-10, abs_tol=1e-8)) for x, y in zip(a, b))


def _timed(fn, repeats):
    fn()  # warm-up excluded; both stores perform same workload
    readings = []
    for _ in range(repeats):
        start = perf_counter_ns()
        fn()
        readings.append((perf_counter_ns() - start) / 1_000_000)
    ordered = sorted(readings)
    return {'iterations': repeats, 'median_ms': round(median(ordered), 5),
            'p95_ms': round(ordered[min(repeats - 1, math.ceil(repeats * .95) - 1)], 5),
            'min_ms': round(ordered[0], 5), 'max_ms': round(ordered[-1], 5)}


def benchmark_onchain(database: str | Path, artifact: str | Path, metric: str,
                      origin: str, *, repeats: int = 15) -> dict:
    if not metric.isalnum() or not metric[0].isalpha() or len(metric) > 64:
        raise ValueError('Invalid metric')
    if not 3 <= repeats <= 1000:
        raise ValueError('repeats must be 3..1000')
    asof = utc_time(origin)
    database = Path(database).resolve()
    artifact = Path(artifact).resolve()
    if not database.is_file():
        raise FileNotFoundError('Canonical SQLite database missing')
    verified = verify_export(artifact)  # hash, schema, row count; excluded from timings
    if verified['kind'] != 'onchain':
        raise ValueError('Benchmark expects onchain Parquet')
    parquet = artifact / 'observations.parquet'
    uri = database.as_uri() + '?mode=ro'
    duckdb = _duckdb()
    # Compare equivalent as-of filters and numeric aggregates; never use future revisions.
    latest_sqlite = '''SELECT day,observed_at,value FROM observations
        WHERE source='coinmetrics-community' AND metric=? AND state='observed'
        AND day < ? AND observed_at <= ? ORDER BY day DESC,observed_at DESC LIMIT 1'''
    agg_sqlite = '''SELECT COUNT(*),SUM(CAST(value AS REAL)) FROM observations
        WHERE source='coinmetrics-community' AND metric=? AND state='observed'
        AND day < ? AND observed_at <= ?'''
    latest_parquet = '''SELECT day,observed_at,value FROM read_parquet(?)
        WHERE source='coinmetrics-community' AND metric=? AND state='observed'
        AND day < ? AND observed_at <= ? ORDER BY day DESC,observed_at DESC LIMIT 1'''
    agg_parquet = '''SELECT COUNT(*),SUM(TRY_CAST(value AS DOUBLE)) FROM read_parquet(?)
        WHERE source='coinmetrics-community' AND metric=? AND state='observed'
        AND day < ? AND observed_at <= ?'''
    filters = (metric, asof.date().isoformat(), asof.isoformat())
    with closing(sqlite3.connect(uri, uri=True)) as sql, closing(duckdb.connect(':memory:')) as con:
        canonical_count = sql.execute('SELECT COUNT(*) FROM observations').fetchone()[0]
        if canonical_count != verified['rows']:
            raise ValueError('SQLite vs DuckDB disagreement: canonical row count differs from Parquet snapshot')
        def sq_latest(): return sql.execute(latest_sqlite, filters).fetchone()
        def pq_latest(): return con.execute(latest_parquet, (str(parquet), *filters)).fetchone()
        def sq_aggregate(): return sql.execute(agg_sqlite, filters).fetchone()
        def pq_aggregate(): return con.execute(agg_parquet, (str(parquet), *filters)).fetchone()
        if not _result_equivalent(sq_latest(), pq_latest()):
            raise ValueError('SQLite vs DuckDB disagreement on latest as-of observation')
        if not _result_equivalent(sq_aggregate(), pq_aggregate()):
            raise ValueError('SQLite vs DuckDB disagreement on bounded aggregate')
        # Query timing intentionally excludes connection creation, validation and parquet hashing.
        times = {
            'point_lookup': {'sqlite': _timed(sq_latest, repeats), 'duckdb_parquet': _timed(pq_latest, repeats)},
            'numeric_aggregate': {'sqlite': _timed(sq_aggregate, repeats), 'duckdb_parquet': _timed(pq_aggregate, repeats)},
        }
        last = sq_latest()
        aggregate = sq_aggregate()
    sizes = { 'sqlite_bytes': database.stat().st_size,
              'sqlite_wal_bytes': (database.parent / (database.name + '-wal')).stat().st_size
                if (database.parent / (database.name + '-wal')).exists() else 0,
              'parquet_bytes': parquet.stat().st_size }
    return {'schema_version': VERSION, 'generated_at': datetime.now(timezone.utc).isoformat(),
        'source': 'coinmetrics-community', 'metric': metric, 'as_of': asof.isoformat(),
        'parquet_sha256': verified['data_sha256'], 'read_parity_verified': True,
        'rows_at_origin': aggregate[0],
        'latest_at_origin': {'day': last[0], 'observed_at': last[1], 'value': last[2]} if last else None,
        'disk': sizes, 'timings_ms': times,
        'notes': ['Read-only warm-cache microbenchmark on one host, not end-to-end ingestion.',
                  'SQLite indexed point lookups and DuckDB Parquet scans use different storage access patterns.',
                  'Physical RAM, WAL locking, concurrent writers, and network latency were not measured.',
                  'Results are machine-dependent; no backend is declared universally faster.']}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--database', type=Path, required=True)
    p.add_argument('--artifact', type=Path, required=True)
    p.add_argument('--metric', required=True)
    p.add_argument('--origin', required=True)
    p.add_argument('--repeats', type=int, default=15)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(argv)
    result = benchmark_onchain(a.database, a.artifact, a.metric, a.origin, repeats=a.repeats)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open('x', encoding='utf-8') as out:
        json.dump(result, out, indent=2, allow_nan=False)
        out.write('\n')
    print(json.dumps({'report': str(a.output), 'read_parity_verified': True,
                      'timings_ms': result['timings_ms']}, indent=2))


if __name__ == '__main__':
    main()
