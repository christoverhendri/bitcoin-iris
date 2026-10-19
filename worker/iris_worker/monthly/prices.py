"""Daily BTC-USD closes.

Sources, tried in order:

1. Coinbase Exchange, paged backwards 300 candles at a time — the same trick
   ``src/lib/sources/coinbase.ts`` uses to reach ~2016.
2. Yahoo Finance chart API (``BTC-USD``, daily, history to 2014). Also what the
   original IRIS datasets were built from (yfinance), and reachable from
   networks that block crypto exchanges (several Indonesian ISPs block both
   Coinbase and Kraken).
3. Kraken (~720 days only — enough to run, thin for the backtest).

A local CSV can be passed instead, for offline runs and for reproducing a paper
figure from a frozen dataset.

All three report daily candles closing at 00:00 UTC, the same instant as
Deribit's daily DVOL close, which ``dvol.align`` relies on.

Only *completed* UTC days are returned: today's candle is still forming and
would put a partial close into the series.
"""

from __future__ import annotations

import csv
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import requests

UA = {"User-Agent": "iris-worker/0.1 (+https://github.com/Programmer7177/IRIS-Terminal)"}
DAY = 86_400


@dataclass
class Series:
    dates: list[str]  # ISO yyyy-mm-dd, ascending, unique
    closes: list[float]
    source: str

    def __len__(self) -> int:
        return len(self.dates)


def _clean(rows: dict[str, float], source: str) -> Series:
    today = datetime.now(timezone.utc).date().isoformat()
    items = sorted((d, c) for d, c in rows.items() if d < today and c and c > 0)
    return Series([d for d, _ in items], [float(c) for _, c in items], source)


def coinbase_daily(years: float = 11, product: str = "BTC-USD", session: requests.Session | None = None) -> Series:
    s = session or requests.Session()
    end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    stop = end - timedelta(days=int(years * 365.25))
    rows: dict[str, float] = {}
    while end > stop:
        start = max(stop, end - timedelta(days=300))
        resp = s.get(
            f"https://api.exchange.coinbase.com/products/{product}/candles",
            params={"granularity": DAY, "start": start.isoformat(), "end": end.isoformat()},
            headers=UA,
            timeout=20,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        for ts, _low, _high, _open, close, _vol in batch:
            rows[datetime.fromtimestamp(ts, timezone.utc).date().isoformat()] = float(close)
        end = start
        time.sleep(0.15)  # stay well under the public rate limit
    if len(rows) < 400:
        raise RuntimeError(f"coinbase returned only {len(rows)} daily candles")
    return _clean(rows, "coinbase")


YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
# Yahoo rejects obviously scripted user agents; a browser-like one is the documented workaround.
YAHOO_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def parse_yahoo_chart(body: dict) -> dict[str, float]:
    """``date -> close`` from a v8 chart response; null closes are skipped."""
    err = (body.get("chart") or {}).get("error")
    if err:
        raise RuntimeError(f"yahoo: {err}")
    res = body["chart"]["result"][0]
    closes = res["indicators"]["quote"][0]["close"]
    rows = {}
    for ts, c in zip(res["timestamp"], closes):
        if c is not None and c > 0:
            rows[datetime.fromtimestamp(int(ts), timezone.utc).date().isoformat()] = float(c)
    return rows


def yahoo_daily(years: float = 11, symbol: str = "BTC-USD", session: requests.Session | None = None) -> Series:
    s = session or requests.Session()
    end = int(time.time())
    start = end - int(years * 365.25 * DAY)
    resp = s.get(YAHOO_URL.format(symbol=symbol),
                 params={"period1": start, "period2": end, "interval": "1d", "events": "history"},
                 headers=YAHOO_UA, timeout=30)
    resp.raise_for_status()
    rows = parse_yahoo_chart(resp.json())
    if len(rows) < 400:
        raise RuntimeError(f"yahoo returned only {len(rows)} daily closes")
    return _clean(rows, "yahoo")


def kraken_daily(pair: str = "XBTUSD", session: requests.Session | None = None) -> Series:
    s = session or requests.Session()
    resp = s.get("https://api.kraken.com/0/public/OHLC", params={"pair": pair, "interval": 1440},
                 headers=UA, timeout=20)
    resp.raise_for_status()
    body = resp.json()
    if body.get("error"):
        raise RuntimeError(f"kraken: {body['error']}")
    key = next(k for k in body["result"] if k != "last")
    rows = {datetime.fromtimestamp(int(r[0]), timezone.utc).date().isoformat(): float(r[4])
            for r in body["result"][key]}
    return _clean(rows, "kraken")


def csv_daily(path: str) -> Series:
    """CSV with a ``date`` column and ``btc_close`` (master files) or ``close``."""
    rows: dict[str, float] = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        col = "btc_close" if "btc_close" in (reader.fieldnames or []) else "close"
        for row in reader:
            try:
                d = date.fromisoformat(row["date"][:10]).isoformat()
                rows[d] = float(row[col])
            except (ValueError, KeyError, TypeError):
                continue
    return _clean(rows, f"csv:{path}")


def load_daily(csv_path: str | None = None) -> Series:
    if csv_path:
        return csv_daily(csv_path)
    errors = []
    for fn in (coinbase_daily, yahoo_daily, kraken_daily):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — try the next source, report all at the end
            errors.append(f"{fn.__name__}: {exc}")
    raise RuntimeError("all price sources failed — " + " | ".join(errors))
