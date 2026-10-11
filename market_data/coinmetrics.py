"""Coin Metrics Community API BTC on-chain data, without paid credentials.

Historical downloads are retrospective snapshots, *not* point-in-time backtests.
The public/community dataset is licensed CC BY-NC 4.0; confirm use rights.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import parse_qsl, urlsplit

import requests

API_URL = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics'
DEFAULT_METRICS = ('AdrActCnt', 'TxCnt')
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_PAGES = 100


def parse_metrics(value: str) -> tuple[str, ...]:
    metrics = tuple(s.strip() for s in value.split(','))
    if not 1 <= len(metrics) <= 12 or len(set(metrics)) != len(metrics):
        raise ValueError('Select 1..12 distinct Coin Metrics metrics')
    if any(not re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,63}', m) for m in metrics):
        raise ValueError('Invalid Coin Metrics metric name')
    return metrics


def valid_page_url(url: str) -> bool:
    # Continuation URLs are untrusted input from an external service. Keep this
    # client on the keyless Community endpoint, with no alternate host/tier.
    if not isinstance(url, str) or len(url) > 8192:
        return False
    try:
        u = urlsplit(url)
        q = dict(parse_qsl(u.query, keep_blank_values=True))
        return (u.scheme == 'https' and u.hostname == 'community-api.coinmetrics.io'
                and u.path == urlsplit(API_URL).path and u.port in (None, 443)
                and u.username is None and u.password is None and not u.fragment
                and 'api_key' not in q and q.get('assets', 'btc') == 'btc'
                and q.get('frequency', '1d') == '1d')
    except ValueError:
        return False


def parse_day(text: str) -> date:
    try:
        d = date.fromisoformat(text)
        if d.isoformat() != text:
            raise ValueError('Must use YYYY-MM-DD')
        return d
    except (TypeError, ValueError) as exc:
        raise ValueError(f'Invalid UTC date {text!r}') from exc


def parse_time(text: str) -> datetime:
    if not isinstance(text, str):
        raise ValueError('Invalid source timestamp')
    try:
        dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('Invalid source timestamp') from exc
    if dt.tzinfo is None:
        raise ValueError('Source timestamp must be timezone-aware')
    return dt.astimezone(timezone.utc)


def _metric_value(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError('Source metric has invalid type')
    raw = str(value)
    if len(raw) > 128:
        raise ValueError('Source metric is oversized')
    try:
        number = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError('Source metric is not numeric') from exc
    if not number.is_finite() or number.adjusted() > 100 or number.adjusted() < -100:
        raise ValueError('Source metric is nonfinite or outside supported magnitude')
    return raw


def _request_page(get, url: str, params: dict | None, sleep) -> tuple[dict, str, int]:
    if not valid_page_url(url):
        raise ValueError('Refusing non-community or off-path next_page_url')
    for attempt in range(3):
        with get(url, params=params, stream=True, allow_redirects=False, timeout=(10, 15)) as response:
            if response.status_code == 403:
                raise PermissionError('Requested metric is not accessible in Coin Metrics Community (free) tier')
            if response.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                retry = response.headers.get('Retry-After', '0')
                try:
                    delay = min(60.0, max(0.0, float(retry)))
                except ValueError:
                    delay = 0.0
                sleep(max(1.0 * (2 ** attempt), delay))
                continue
            if 300 <= response.status_code < 400:
                raise ValueError(f'Unexpected redirect HTTP {response.status_code}')
            if response.status_code != 200:
                response.raise_for_status()
                raise ValueError(f'Unexpected Coin Metrics HTTP {response.status_code}')
            if 'application/json' not in response.headers.get('Content-Type', '').lower():
                raise ValueError('Unexpected Coin Metrics content type')
            chunks: list[bytes] = []
            size = 0
            started = time.monotonic()
            for chunk in response.iter_content(chunk_size=8192):
                size += len(chunk)
                if size > MAX_PAGE_BYTES or time.monotonic() - started > 30:
                    raise ValueError('Coin Metrics page exceeded byte/time budget')
                chunks.append(chunk)
            body = b''.join(chunks)
            try:
                payload = json.loads(body, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
            except (UnicodeError, ValueError) as exc:
                raise ValueError('Invalid JSON response from Coin Metrics') from exc
            if not isinstance(payload, dict) or not isinstance(payload.get('data'), list):
                raise ValueError('Invalid Coin Metrics API response')
            return payload, hashlib.sha256(body).hexdigest(), size
    raise RuntimeError('Unreachable retry state')


def fetch_community(start: str, end: str, metrics: tuple[str, ...] = DEFAULT_METRICS,
                    *, get=requests.get, sleep=time.sleep, now: datetime | None = None) -> dict:
    """Fetch [start, end) UTC daily metrics. Injection points enable offline tests.

    The source's daily timestamp is not proof of when its value was first known.
    All returned values are stamped with the actual local observation time.
    """
    first, last = parse_day(start), parse_day(end)
    checked_at = now or datetime.now(timezone.utc)
    if checked_at.tzinfo is None:
        raise ValueError('Observation time must include timezone')
    checked_at = checked_at.astimezone(timezone.utc)
    if first >= last or last > checked_at.date():
        raise ValueError('Require a nonempty interval ending at/before current UTC day (no unfinished bars)')
    metrics = parse_metrics(','.join(metrics))
    params = {'assets': 'btc', 'metrics': ','.join(metrics), 'frequency': '1d',
              'start_time': start, 'end_time': end, 'page_size': 1000}
    url = API_URL
    visited = set()
    found: dict[tuple[str, str], str | None] = {}
    provenance = []
    for page in range(MAX_PAGES):
        if url in visited:
            raise ValueError('Coin Metrics pagination cycle detected')
        visited.add(url)
        payload, sha, nbytes = _request_page(get, url, params, sleep)
        provenance.append({'page': page + 1, 'sha256': sha, 'bytes': nbytes})
        if len(payload['data']) > 10000:
            raise ValueError('Unexpected large Coin Metrics page')
        for item in payload['data']:
            if not isinstance(item, dict) or item.get('asset') != 'btc':
                raise ValueError('Unexpected asset in Coin Metrics response')
            at = parse_time(item.get('time'))
            if any((at.hour, at.minute, at.second, at.microsecond)):
                raise ValueError('Coin Metrics daily data must align to UTC midnight')
            day = at.date().isoformat()
            if not (first <= at.date() < last):
                continue  # The API may return an inclusive endpoint; do not use it.
            for metric in metrics:
                value = _metric_value(item.get(metric))
                key = (day, metric)
                if key in found and found[key] != value:
                    raise ValueError(f'Conflicting duplicate values for {day} {metric}')
                found[key] = value
        next_page = payload.get('next_page_url')
        if not next_page:
            if payload.get('next_page_token'):
                raise ValueError('Coin Metrics omitted next_page_url despite next_page_token')
            break
        if not isinstance(next_page, str) or not valid_page_url(next_page):
            raise ValueError('Unexpected Coin Metrics pagination destination')
        url = next_page
        params = None  # Pagination URL from provider already has its query.
        sleep(0.7)  # Conservative pacing below documented Community rate limit.
    else:
        raise ValueError('Coin Metrics pagination exceeds safety limit')
    if not found or not any(v is not None for v in found.values()):
        raise ValueError('Coin Metrics returned no usable metric values')
    from datetime import timedelta
    # Stamp when the last page has arrived, never an earlier request-start time.
    observed_at = checked_at if now is not None else datetime.now(timezone.utc)
    rows = []
    missing_days = []
    for step in range((last - first).days):
        day = (first + timedelta(days=step)).isoformat()
        any_present = any((day, metric) in found for metric in metrics)
        if not any_present:
            missing_days.append(day)
        for metric in metrics:
            value = found.get((day, metric))
            state = 'missing_day' if not any_present else 'missing_metric' if value is None else 'observed'
            rows.append({'date': day, 'metric': metric, 'value': value, 'state': state,
                         'observed_at': observed_at.isoformat()})
    return {'rows': rows, 'source': 'coinmetrics-community', 'requested_start': start,
            'requested_end_exclusive': end, 'metrics': metrics,
            'observed_at': observed_at.isoformat(), 'missing_days': missing_days,
            'pages': provenance, 'historical_backtest_safe': False}


def write_artifact(result: dict, output: Path | str) -> dict:
    """Create an immutable local export. Missing data remains blank, never zero-filled."""
    folder = Path(output)
    folder.mkdir(parents=True, exist_ok=False)
    path = folder / 'onchain_daily.csv'
    with path.open('x', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['date', 'metric', 'value', 'state', 'observed_at'])
        writer.writeheader()
        writer.writerows(result['rows'])
    stats = {}
    for row in result['rows']:
        stats[row['state']] = stats.get(row['state'], 0) + 1
    metadata = {k: v for k, v in result.items() if k != 'rows'}
    metadata.update({'row_count': len(result['rows']), 'row_states': stats,
                     'data_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'license': 'CC BY-NC 4.0: attribute source; noncommercial research only',
                     'url': API_URL,
                     'availability_contract': 'Values first observed at observed_at; historical date does not certify historical availability. No bfill/ffill.'})
    (folder / 'provenance.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    return metadata


def main(argv=None):
    parser = argparse.ArgumentParser(description='Free Coin Metrics on-chain research export (no API key)')
    parser.add_argument('--start', required=True, help='First UTC day, YYYY-MM-DD')
    parser.add_argument('--end', required=True, help='Exclusive UTC day, YYYY-MM-DD; must be completed')
    parser.add_argument('--metrics', default=','.join(DEFAULT_METRICS))
    parser.add_argument('--output', required=True, type=Path, help='New empty/non-existing directory')
    args = parser.parse_args(argv)
    result = fetch_community(args.start, args.end, parse_metrics(args.metrics))
    manifest = write_artifact(result, args.output)
    print(json.dumps({'rows': manifest['row_count'], 'states': manifest['row_states'],
                      'output': str(args.output), 'historical_backtest_safe': False}))


if __name__ == '__main__':
    main()
