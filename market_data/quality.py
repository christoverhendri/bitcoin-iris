"""Deterministic, fail-closed IRIS data-quality reports for research datasets.

Structural validity is deliberately separate from historical availability:
cryptographic integrity of a retrospective download never certifies past access.
This module never contacts paid providers, fabricates observations or promotes ML.
"""
from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import sqlite3

from .point_in_time import utc_time
from .warehouse import MAX_ROWS, SCHEMAS, _sha256, verify_export

VERSION = 'iris-data-quality/v1'
MAX_CSV_BYTES = 128 * 1024 * 1024
MAX_CSV_ROWS = 100_000
MAX_EXAMPLES = 12
PRICE_FIELDS = ['date', 'Low', 'High', 'Open', 'Close', 'Volume']


def _report(kind: str, source: str, fingerprint: str | None) -> dict:
    return {'schema_version': VERSION, 'kind': kind, 'source': source,
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'data_sha256': fingerprint, 'quality_gate': 'pass',
            'historical_backtest_safe': False, 'checks': [], 'summary': {},
            'warnings': ['File integrity and valid prices do not establish historical vendor release timestamps.']}


def _check(report: dict, code: str, valid: bool, *, detail: str, severity='error') -> None:
    report['checks'].append({'code': code, 'result': 'pass' if valid else 'fail', 'detail': detail})
    if not valid and severity == 'error':
        report['quality_gate'] = 'fail'


def _parse_day(raw: str) -> date:
    value = date.fromisoformat(raw)
    if value.isoformat() != raw:
        raise ValueError('Expected canonical UTC YYYY-MM-DD day')
    return value


def _read_csv(path: Path, required: list[str]):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_CSV_BYTES:
        raise ValueError('CSV missing, symlinked or oversized')
    with path.open('r', newline='', encoding='utf-8-sig') as inp:
        reader = csv.DictReader(inp)
        if not reader.fieldnames or not set(required).issubset(reader.fieldnames):
            raise ValueError(f'CSV lacks columns: {required}')
        for n, row in enumerate(reader, 1):
            if n > MAX_CSV_ROWS:
                raise ValueError('Dataset exceeds quality scan row limit')
            yield row


def _load_prices(artifact: Path):
    """Read a verified Coinbase artifact or verified Parquet warehouse."""
    artifact = Path(artifact).resolve()
    if (artifact / 'prices.parquet').is_file():
        verified = verify_export(artifact)  # schema + row count + SHA-256
        if verified['kind'] != 'prices':
            raise ValueError('Expected prices warehouse')
        manifest = json.loads((artifact / 'manifest.json').read_text(encoding='utf-8'))
        import duckdb  # optional: a verified parquet read model is required here
        with closing(duckdb.connect(':memory:')) as con:
            values = con.execute('SELECT date, Low, High, Open, Close, Volume FROM read_parquet(?)',
                                 [str(artifact / 'prices.parquet')]).fetchall()
        rows = [dict(zip(PRICE_FIELDS, row)) for row in values]
        meta = {'source': manifest.get('source'), 'venue': manifest.get('venue'),
                'instrument': manifest.get('instrument'), 'requested_start': manifest.get('first_day'),
                'requested_end_exclusive': manifest.get('end_exclusive'),
                'fetched_at': manifest.get('source_fetched_at')}
        return meta, verified['data_sha256'], rows, 'parquet'
    manifest = json.loads((artifact / 'provenance.json').read_text(encoding='utf-8'))
    path = artifact / 'prices.csv'
    fingerprint = _sha256(path)
    if manifest.get('data_sha256') != fingerprint:
        raise ValueError('Price CSV provenance SHA-256 mismatch')
    return manifest, fingerprint, list(_read_csv(path, PRICE_FIELDS)), 'csv'


def prices_report(artifact: str | Path, *, as_of: str | None = None,
                  max_age_days: int | None = None, min_coverage: float = 1.0) -> dict:
    if not 0 <= min_coverage <= 1:
        raise ValueError('min_coverage must be 0..1')
    if max_age_days is not None and not 0 <= max_age_days <= 36500:
        raise ValueError('max_age_days must be 0..36500 or omitted')
    meta, sha, rows, storage_format = _load_prices(Path(artifact))
    report = _report('prices', str(meta.get('source')), sha)
    report['summary']['storage_format'] = storage_format
    _check(report, 'source_identity', meta.get('source') == 'coinbase-exchange'
           and meta.get('venue') == 'coinbase-exchange'
           and meta.get('instrument') == 'BTC/USD', detail='Must be Coinbase BTC/USD')
    first = _parse_day(meta['requested_start'])
    cutoff = utc_time(meta['requested_end_exclusive'])
    observed = utc_time(meta['fetched_at'])
    asof = utc_time(as_of) if as_of else datetime.now(timezone.utc)
    _check(report, 'source_cutoff', cutoff.time() == datetime.min.time().replace(tzinfo=None)
           and first < cutoff.date() and observed >= cutoff,
           detail='Cutoff is exclusive UTC midnight and collection follows it')
    _check(report, 'snapshot_available', observed <= asof,
           detail='Source artifact must have been fetched by report as-of cutoff')
    seen = set()
    duplicate_days, out_of_range, invalid_ohlc = [], [], []
    for row in rows:
        try:
            day = _parse_day(str(row['date']))
            if day in seen:
                duplicate_days.append(day.isoformat())
            seen.add(day)
            if not first <= day < cutoff.date():
                out_of_range.append(day.isoformat())
            low, high, opening, closing, volume = [float(row[x]) for x in PRICE_FIELDS[1:]]
            if (not all(math.isfinite(x) for x in (low, high, opening, closing, volume))
                or min(low, high, opening, closing) <= 0 or volume < 0
                or low > min(opening, closing) or high < max(opening, closing)):
                invalid_ohlc.append(day.isoformat())
        except (ValueError, TypeError, KeyError, OverflowError):
            invalid_ohlc.append(str(row.get('date', '?'))[:32])
    expected_count = (cutoff.date() - first).days
    if not 0 < expected_count <= MAX_CSV_ROWS:
        raise ValueError('Unbounded or empty requested Coinbase date range')
    # The first and last expected date are part of the source contract.
    gaps = [(first + timedelta(days=i)).isoformat() for i in range(expected_count)
            if first + timedelta(days=i) not in seen]
    coverage = (expected_count - len(gaps)) / expected_count if expected_count else 0.0
    _check(report, 'unique_dates', not duplicate_days,
           detail=f'{len(duplicate_days)} duplicate dates')
    _check(report, 'date_bounds', not out_of_range,
           detail=f'{len(out_of_range)} dates outside requested UTC interval')
    _check(report, 'ohlcv_invariants', not invalid_ohlc,
           detail=f'{len(invalid_ohlc)} invalid or nonfinite OHLCV rows')
    _check(report, 'daily_coverage', coverage >= min_coverage and not gaps if min_coverage == 1 else coverage >= min_coverage,
           detail=f'{coverage:.2%} observed of {expected_count} expected UTC days (min {min_coverage:.2%})')
    newest = max((d for d in seen if first <= d < cutoff.date()), default=None)
    age_days = (asof.date() - newest).days if newest else None
    if max_age_days is not None:
        _check(report, 'freshness', age_days is not None and 0 <= age_days <= max_age_days,
               detail=f'Newest candle age {age_days} days; max {max_age_days}')
    report['summary'].update(rows=len(rows), expected_days=expected_count,
        missing_days=len(gaps), coverage_pct=round(coverage * 100, 4),
        first_day=first.isoformat(), end_exclusive=cutoff.isoformat(),
        newest_day=newest.isoformat() if newest else None,
        newest_age_days=age_days, source_fetched_at=observed.isoformat(), as_of=asof.isoformat(),
        duplicate_days=len(duplicate_days), invalid_ohlcv=len(invalid_ohlc),
        missing_examples=gaps[:MAX_EXAMPLES], duplicate_examples=duplicate_days[:MAX_EXAMPLES],
        invalid_examples=invalid_ohlc[:MAX_EXAMPLES])
    return report


def hourly_prices_report(artifact: str | Path) -> dict:
    """Verify SHA-bound hourly Parquet; incomplete hours remain a failing gate."""
    from .hourly_prices import verify_hourly
    verified = verify_hourly(artifact)
    report = _report('prices_hourly', 'coinbase-exchange', verified['data_sha256'])
    report['quality_gate'] = verified['quality_gate']
    report['summary'] = {
        'observed_hours': verified['observed_hours'],
        'expected_hours': verified['expected_hours'],
        'missing_hours': verified['missing_hours'],
        'coverage_pct': verified['coverage_pct'],
        'first_hour': verified['first_hour'],
        'last_hour': verified['last_hour'],
    }
    _check(report, 'hourly_integrity', True,
           detail='Parquet hash, schema, rows, UTC bounds and OHLCV invariants verified')
    _check(report, 'hourly_coverage', verified['missing_hours'] == 0,
           detail=f"{verified['observed_hours']}/{verified['expected_hours']} hourly candles present")
    return report


def minute_activity_report(minute_database: str | Path, hourly_database: str | Path,
                           *, start: str, end: str, as_of: str | None = None) -> dict:
    """Activity-aware market quality without treating omitted minutes as ticks."""
    from .minute_activity import classify
    evidence = classify(minute_database, hourly_database, start=start, end=end, as_of=as_of)
    report = _report('minute_activity', 'coinbase-exchange', None)
    report['quality_gate'] = evidence['quality_gate']
    report['summary'] = {
        'start': evidence['start'], 'end_exclusive': evidence['end_exclusive'],
        'as_of': evidence['as_of'], 'status_counts': evidence['counts'],
        'diagnostics': evidence['diagnostics'],
        'reconciled_hours': sum(1 for hour in evidence['hours'] if hour['reconciled']),
        'hours': evidence['hours'],
    }
    report['checks'] = [{
        'code': 'minute_activity_evidence',
        'result': 'pass' if evidence['quality_gate'] == 'pass' else 'fail',
        'detail': 'UNKNOWN minutes and hourly disagreements block a complete-activity pass',
    }]
    report['warnings'].append('INFERRED_NO_TRADE is not verified trade-ledger proof.')
    return report


def etf_flows_report(database: str | Path, *, as_of: str | None = None,
                     start: str | None = None, end: str | None = None) -> dict:
    """Read observed, versioned ETF net flows without treating unreported as zero."""
    from .etf_flows import quality_report
    evidence = quality_report(database, as_of=as_of, start=start, end=end)
    # Hash here binds the set of effective research values; it is NOT the
    # source-HTML response SHA or a certified historical provider vintage.
    result = _report('etf_flows', evidence['source'],
                     evidence['summary']['effective_source_sha256'])
    result['quality_gate'] = evidence['quality_gate']
    result['summary'] = dict(evidence['summary'],
                             unit=evidence['unit'],
                             instrument=evidence['instrument'],
                             as_of=evidence['as_of'])
    _check(result, 'reported_etf_sessions',
           evidence['summary']['reported_sessions'] > 0,
           detail=f"{evidence['summary']['reported_sessions']} sessions have reportable fund and total data")
    result['warnings'].extend(evidence['warnings'])
    result['warnings'].append('Report fingerprint identifies effective values, not raw provider bytes.')
    return result


def onchain_report(database: str | Path, *, as_of: str | None = None,
                   max_age_days: int | None = None, min_coverage: float = 0.95) -> dict:
    if not 0 <= min_coverage <= 1:
        raise ValueError('min_coverage must be 0..1')
    if max_age_days is not None and not 0 <= max_age_days <= 36500:
        raise ValueError('max_age_days must be 0..36500 or omitted')
    asof = utc_time(as_of) if as_of else datetime.now(timezone.utc)
    database = Path(database).resolve()
    if not database.is_file() or database.is_symlink():
        raise ValueError('Canonical observation SQLite file missing or symlinked')
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'observations', 'snapshots'}.issubset(tables):
            raise ValueError('Not a canonical Coin Metrics observation database')
        rows = db.execute('''SELECT source,metric,day,observed_at,value,state,snapshot_sha256
                             FROM observations WHERE observed_at <= ? ORDER BY metric,day,observed_at''',
                          (asof.isoformat(),)).fetchmany(MAX_ROWS + 1)
        snapshot_count = db.execute('SELECT COUNT(*) FROM snapshots').fetchone()[0]
        orphan_count = db.execute('''SELECT COUNT(*) FROM observations o
            LEFT JOIN snapshots s ON o.snapshot_sha256=s.data_sha256
            WHERE o.observed_at<=? AND (s.data_sha256 IS NULL OR s.source!=o.source
                                      OR s.observed_at!=o.observed_at
                                      OR o.day<s.first_day OR o.day>=s.end_exclusive)''',
            (asof.isoformat(),)).fetchone()[0]
    if len(rows) > MAX_ROWS:
        raise ValueError('Too many observations for a bounded quality scan')
    report = _report('onchain', 'coinmetrics-community', _sha256(database))
    report['warnings'].append('SQLite SHA-256 is a local fingerprint, not a stable WAL snapshot ID.')
    report['summary']['as_of'] = asof.isoformat()
    _check(report, 'nonempty', len(rows) > 0, detail=f'{len(rows)} observed revisions eligible at as-of')
    _check(report, 'snapshot_integrity', orphan_count == 0 and snapshot_count > 0,
           detail=f'{orphan_count} rows have missing/mismatched canonical source checkpoints')
    latest: dict[tuple[str, str], tuple] = {}
    versions = defaultdict(int)
    violations = []
    for source, metric, day, stamp, val, state, sha in rows:
        try:
            d = _parse_day(day)
            observed = utc_time(stamp)
            if (source != 'coinmetrics-community' or not metric or not isinstance(metric,str)
                or state not in {'observed', 'missing_metric', 'missing_day'}
                or observed < datetime.combine(d + timedelta(days=1), datetime.min.time(), timezone.utc)
                or not isinstance(sha, str) or len(sha) != 64
                or any(ch not in '0123456789abcdef' for ch in sha)):
                raise ValueError('Invalid source, state, metadata or observation time')
            if state == 'observed':
                numeric = Decimal(val)
                if not numeric.is_finite():
                    raise ValueError('Nonfinite value')
            elif val is not None:
                raise ValueError('Missingness has a fabricated numeric value')
        except (ValueError, TypeError, InvalidOperation, OverflowError):
            if len(violations) < MAX_EXAMPLES:
                violations.append((metric, str(day)))
            continue
        key = metric, day
        versions[key] += 1
        latest[key] = (state, val, stamp)
    _check(report, 'canonical_rows', not violations,
           detail=f'{len(violations)} malformed canonical observations (sample capped)')
    groups: dict[str, dict] = {}
    for (metric, day), (state, val, stamp) in latest.items():
        slot = groups.setdefault(metric, {'observed': 0, 'missing_day': 0, 'missing_metric': 0,
                                          'dates': set(), 'latest_observed_date': None})
        slot[state] += 1
        slot['dates'].add(day)
        if state == 'observed' and (slot['latest_observed_date'] is None or day > slot['latest_observed_date']):
            slot['latest_observed_date'] = day
    details = []
    for metric in sorted(groups):
        g = groups[metric]
        first, last = min(g['dates']), max(g['dates'])
        span = (_parse_day(last) - _parse_day(first)).days + 1
        implicit = span - len(g['dates'])
        rate = g['observed'] / span if span else 0
        age = ((asof.date() - _parse_day(g['latest_observed_date'])).days
               if g['latest_observed_date'] else None)
        detail = {'metric': metric, 'first_day': first, 'last_day': last,
                  'observed': g['observed'], 'missing_day': g['missing_day'],
                  'missing_metric': g['missing_metric'], 'implicit_missing_days': implicit,
                  'coverage_pct': round(rate*100, 4), 'revisions': sum(versions[k] - 1 for k in versions if k[0] == metric),
                  'newest_observed_age_days': age}
        details.append(detail)
        _check(report, f'coverage:{metric}', rate >= min_coverage,
               detail=f'{rate:.2%} ({g["observed"]}/{span} UTC days); minimum {min_coverage:.2%}')
        if max_age_days is not None:
            _check(report, f'freshness:{metric}', age is not None and 0 <= age <= max_age_days,
                   detail=f'Newest observed metric age {age} days; max {max_age_days}')
    report['summary'].update(eligible_revisions=len(rows), snapshot_count=snapshot_count,
                             missing_snapshot_links=orphan_count,
                             unique_metric_days=len(latest), revision_rows=sum(n - 1 for n in versions.values()),
                             metrics=details, invalid_examples=violations[:MAX_EXAMPLES])
    return report


def legacy_prices_report(csv_path: str | Path) -> dict:
    """Inventory the checked-in historic CSV without claiming vendor provenance."""
    path = Path(csv_path)
    fingerprint = _sha256(path)
    report = _report('legacy_prices', 'unknown-historical-vintage', fingerprint)
    report['quality_gate'] = 'research_only'
    report['warnings'].append('Legacy CSV has no verified vendor vintage; never promote it to deployable PIT training.')
    days, duplicated, invalid, missing = set(), [], [], 0
    for row in _read_csv(path, ['date', 'Close']):
        try:
            d = _parse_day(str(row['date']))
            c = float(row['Close'])
            if not math.isfinite(c) or c <= 0:
                raise ValueError('Nonpositive close')
            if d in days:
                duplicated.append(d.isoformat())
            days.add(d)
        except (ValueError, KeyError, TypeError):
            invalid.append(str(row.get('date', '?'))[:32])
    first, last = min(days, default=None), max(days, default=None)
    if first and last:
        missing = (last - first).days + 1 - len(days)
    report['summary'].update(rows=len(days) + len(duplicated) + len(invalid),
        first_day=first.isoformat() if first else None,
        last_day=last.isoformat() if last else None,
        duplicate_dates=len(duplicated), invalid_close_rows=len(invalid),
        missing_internal_days=missing, duplicate_examples=duplicated[:MAX_EXAMPLES],
        invalid_examples=invalid[:MAX_EXAMPLES])
    _check(report, 'legacy_date_integrity', not duplicated and not invalid and missing == 0,
           detail=f'{len(duplicated)} duplicate days; {len(invalid)} invalid close rows; {missing} gaps',
           severity='warning')
    # Research-only status wins even when diagnostic checks are clean.
    return report


def crosscheck_report(primary: str | Path, reference: str | Path, *,
                      max_difference_bps: float = 100, min_overlap: int = 10,
                      max_breach_pct: float = 5.0) -> dict:
    if max_difference_bps <= 0 or not 0 <= max_breach_pct <= 100 or min_overlap < 1:
        raise ValueError('Invalid cross-venue thresholds')
    meta, fingerprint, rows, _ = _load_prices(Path(primary))
    if meta.get('venue') != 'coinbase-exchange':
        raise ValueError('Primary must be Coinbase BTC/USD')
    primary_quality = prices_report(primary)
    ref = list(_read_csv(Path(reference), ['date', 'Close']))
    report = _report('cross_venue', 'coinbase-vs-reference', fingerprint)
    report['warnings'].append('Comparison input is user-supplied and does not independently authenticate Kraken provenance.')
    _check(report, 'primary_integrity', primary_quality['quality_gate'] == 'pass',
           detail='Coinbase input must pass its complete OHLCV and date-quality gate')
    left, right = {}, {}
    duplicate = []
    for name, values, dest in (('primary', rows, left), ('reference', ref, right)):
        for row in values:
            d = _parse_day(str(row['date'])).isoformat()
            val = float(row['Close'])
            if not math.isfinite(val) or val <= 0:
                raise ValueError(f'{name}: invalid positive close')
            if d in dest:
                duplicate.append(f'{name}:{d}')
            dest[d] = val
    common = sorted(left.keys() & right.keys())
    differences = [(d, abs(math.log(left[d] / right[d])) * 10000) for d in common]
    violations = [(d, v) for d, v in differences if v > max_difference_bps]
    _check(report, 'unique_dates', not duplicate, detail=f'{len(duplicate)} duplicate source dates')
    _check(report, 'overlap', len(common) >= min_overlap, detail=f'{len(common)} shared UTC dates (minimum {min_overlap})')
    breach_pct = 100 * len(violations) / len(differences) if differences else 100.0
    _check(report, 'price_disagreement', len(differences) > 0 and breach_pct <= max_breach_pct,
           detail=f'{breach_pct:.2f}% of aligned dates exceed {max_difference_bps} log basis points')
    report['summary'].update(overlap_days=len(common), first_overlap=common[0] if common else None,
       last_overlap=common[-1] if common else None, breach_days=len(violations), breach_pct=round(breach_pct,3),
       median_abs_bps=round(sorted([v for _,v in differences])[len(differences)//2],3) if differences else None,
       max_abs_bps=round(max((v for _,v in differences), default=0),3),
       largest_disagreements=[{'date':d,'abs_log_bps':round(v,3)} for d,v in sorted(differences,key=lambda x:x[1],reverse=True)[:MAX_EXAMPLES]],
       reference_sha256=_sha256(Path(reference)), primary_rows=len(rows),reference_rows=len(ref))
    return report


def verify_quality_report(path: str | Path, data_file: str | Path) -> dict:
    """Check a previously generated report is passing and bound to exact input bytes."""
    report = json.loads(Path(path).read_text(encoding='utf-8'))
    if (report.get('schema_version') != VERSION or report.get('kind') != 'prices'
            or report.get('source') != 'coinbase-exchange'
            or report.get('quality_gate') != 'pass' or report.get('historical_backtest_safe') is not False
            or report.get('data_sha256') != _sha256(Path(data_file))):
        raise ValueError('Price quality report is failing, incompatible or bound to a different artifact')
    return report


def main(argv=None):
    p = argparse.ArgumentParser(description='Bitcoin IRIS data quality gates; no paid provider')
    sub = p.add_subparsers(dest='kind', required=True)
    pr = sub.add_parser('prices', help='Validate Coinbase artifact or Parquet warehouse')
    pr.add_argument('--artifact', type=Path, required=True)
    pr.add_argument('--as-of')
    pr.add_argument('--max-age-days', type=int)
    pr.add_argument('--min-coverage', type=float, default=1.0)
    hh = sub.add_parser('hourly', help='Validate Coinbase hourly Parquet warehouse')
    hh.add_argument('--artifact', type=Path, required=True)
    minute = sub.add_parser('minute', help='Validate 1m activity against a separate 1h Coinbase reference')
    minute.add_argument('--minute-database', type=Path, required=True)
    minute.add_argument('--hourly-database', type=Path, required=True)
    minute.add_argument('--start', required=True)
    minute.add_argument('--end', required=True)
    minute.add_argument('--as-of')
    etf = sub.add_parser('etf', help='Validate Farside US BTC ETF flows from canonical SQLite')
    etf.add_argument('--database', type=Path, required=True)
    etf.add_argument('--as-of')
    etf.add_argument('--start')
    etf.add_argument('--end')
    on = sub.add_parser('onchain', help='Validate canonical Coin Metrics observation SQLite')
    on.add_argument('--database', type=Path, required=True)
    on.add_argument('--as-of')
    on.add_argument('--max-age-days', type=int)
    on.add_argument('--min-coverage', type=float, default=0.95)
    lg = sub.add_parser('legacy', help='Research-only diagnostic of unprovenanced historical CSV')
    lg.add_argument('--csv', type=Path, required=True)
    x = sub.add_parser('cross-check', help='Compare Coinbase vs independently obtained recent venue CSV')
    x.add_argument('--primary', type=Path, required=True)
    x.add_argument('--reference', type=Path, required=True)
    x.add_argument('--max-difference-bps', type=float, default=100.0)
    x.add_argument('--min-overlap', type=int, default=10)
    x.add_argument('--max-breach-pct', type=float, default=5.0)
    for command in (pr, hh, minute, etf, on, lg, x):
        command.add_argument('--output', type=Path, required=True)
    args = p.parse_args(argv)
    try:
        if args.kind == 'prices':
            report = prices_report(args.artifact, as_of=args.as_of, max_age_days=args.max_age_days,
                                   min_coverage=args.min_coverage)
        elif args.kind == 'hourly':
            report = hourly_prices_report(args.artifact)
        elif args.kind == 'minute':
            report = minute_activity_report(args.minute_database, args.hourly_database,
                                            start=args.start, end=args.end, as_of=args.as_of)
        elif args.kind == 'etf':
            report = etf_flows_report(args.database, as_of=args.as_of,
                                      start=args.start, end=args.end)
        elif args.kind == 'onchain':
            report = onchain_report(args.database, as_of=args.as_of, max_age_days=args.max_age_days,
                                   min_coverage=args.min_coverage)
        elif args.kind == 'legacy':
            report = legacy_prices_report(args.csv)
        else:
            report = crosscheck_report(args.primary, args.reference,
                max_difference_bps=args.max_difference_bps,
                min_overlap=args.min_overlap, max_breach_pct=args.max_breach_pct)
    except (ValueError, KeyError, OSError, sqlite3.Error, ImportError, TypeError, OverflowError) as exc:
        report = _report(args.kind, 'unverified', None)
        _check(report, 'validation_exception', False,
               detail=f'{type(exc).__name__}: {str(exc)[:220]}')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as out:
        json.dump(report, out, indent=2, allow_nan=False)
        out.write('\n')
    print(json.dumps({'report': str(args.output), 'quality_gate': report['quality_gate'],
                      'summary': report['summary']}, indent=2))
    return 1 if report['quality_gate'] == 'fail' else 0


if __name__ == '__main__':
    raise SystemExit(main())
