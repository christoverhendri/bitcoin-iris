"""Fetch validated daily BTC/USD candles from the Coinbase Exchange API.

This module deliberately has no dependency on the historical yfinance loader.
The API data is written as a new, provenance-bearing artifact directory.
"""
import argparse
import csv
import hashlib
import json
import math
import time
from datetime import date, datetime, time as dt_time, timedelta, timezone
from pathlib import Path

import requests
import truststore

URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles"
GRANULARITY = 86400
MAX_DAYS = 300


def _parse_date(value):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid date: {value!r}") from exc


def _parse_as_of(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid --as-of datetime: {value!r}") from exc
    if parsed.tzinfo is None:
        raise ValueError("--as-of must include a timezone")
    return parsed.astimezone(timezone.utc)


def _iso_day(day):
    return datetime.combine(day, dt_time(), timezone.utc).isoformat().replace("+00:00", "Z")


def _request_candles(get, start, end, timeout):
    response = get(URL, params={"granularity": GRANULARITY, "start": _iso_day(start), "end": _iso_day(end)}, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Coinbase candles response must be a list")
    return payload


def fetch_daily(start, as_of, get=requests.get, timeout=20, sleep=time.sleep):
    """Fetch and validate every UTC daily candle in ``[start, as_of)``.

    Returns rows in ascending date order. ``get`` and ``sleep`` are injectable
    for deterministic tests; production requests are throttled to 2/sec.
    """
    first = _parse_date(start) if isinstance(start, str) else start
    cutoff = _parse_as_of(as_of if isinstance(as_of, str) else as_of.isoformat())
    last = cutoff.date()
    if first >= last:
        raise ValueError("start must be before the as-of UTC date")
    bars = {}
    cursor = first
    request_count = 0
    while cursor < last:
        end = min(cursor + timedelta(days=MAX_DAYS), last)
        if request_count:
            sleep(0.5)
        for raw in _request_candles(get, cursor, end, timeout):
            if not isinstance(raw, (list, tuple)) or len(raw) != 6:
                raise ValueError("Coinbase candle must contain [time, low, high, open, close, volume]")
            try:
                stamp = int(raw[0])
                if isinstance(raw[0], bool) or float(raw[0]) != stamp:
                    raise ValueError('candle timestamp must be an integer')
                dt = datetime.fromtimestamp(stamp, timezone.utc)
                values = [float(x) for x in raw[1:]]
            except (TypeError, ValueError, OverflowError) as exc:
                raise ValueError("invalid Coinbase candle values") from exc
            if dt.time() != dt_time():
                raise ValueError("candle timestamp is not a UTC day boundary")
            day = dt.date()
            # The API may include bars outside the requested page (including its
            # inclusive end). Keep each bar owned by exactly one page.
            if not (cursor <= day < end):
                continue
            if not all(math.isfinite(x) for x in values) or any(x <= 0 for x in values[:4]):
                raise ValueError(f"nonpositive or non-finite OHLC for {day}")
            if values[4] < 0:
                raise ValueError(f"negative volume for {day}")
            if day in bars:
                raise ValueError(f"duplicate candle for {day}")
            low, high, opening, close = values[:4]
            if low > min(opening, close) or high < max(opening, close) or low > high:
                raise ValueError(f"inconsistent OHLC range for {day}")
            bars[day] = values
        cursor = end
        request_count += 1
    expected = [first + timedelta(days=i) for i in range((last - first).days)]
    missing = [d.isoformat() for d in expected if d not in bars]
    if missing:
        raise ValueError(f"missing Coinbase candles: {', '.join(missing[:5])}{'...' if len(missing) > 5 else ''}")
    return [(day.isoformat(), *bars[day]) for day in expected]


def write_artifact(rows, output, start, as_of, fetched_at=None):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    csv_path = output / "prices.csv"
    with csv_path.open("x", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["date", "Low", "High", "Open", "Close", "Volume"])
        writer.writerows(rows)
    digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    metadata = {
        "source": "coinbase-exchange", "venue": "coinbase-exchange", "instrument": "BTC/USD",
        "requested_start": _parse_date(start).isoformat(), "requested_end_exclusive": _parse_as_of(as_of).isoformat(),
        "granularity_seconds": GRANULARITY, "fetched_at": fetched_at or datetime.now(timezone.utc).isoformat(),
        "data_sha256": digest, "prices_sha256": digest,
    }
    (output / "provenance.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, help="first UTC date, YYYY-MM-DD")
    parser.add_argument("--as-of", required=True, help="timezone-aware cutoff, for example 2026-09-08T00:00:00Z")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    # Use the operating-system CA store, matching the existing collector; TLS
    # certificate verification remains enabled.
    truststore.inject_into_ssl()
    rows = fetch_daily(args.start, args.as_of)
    write_artifact(rows, args.output, args.start, args.as_of)
    print(f"wrote {len(rows)} daily candles to {args.output}")


if __name__ == "__main__":
    main()
