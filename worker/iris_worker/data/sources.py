"""
iris_worker.data.sources
========================
Fetcher per sumber data input model klasifikasi. Setiap fungsi mengembalikan
Series/DataFrame ber-index tanggal UTC (naive, dinormalisasi ke 00:00) dan
TIDAK melakukan ffill — penyelarasan ke index harian dilakukan di `build.py`.

Pemetaan kolom -> sumber dicocokkan terhadap CSV training (btc_master_2.csv)
pada periode overlap; lihat `python -m iris_worker.jobs.validate_sources`.

| Kolom                         | Sumber                                   | Kunci |
|-------------------------------|------------------------------------------|-------|
| btc_open/high/low/close/vol   | Yahoo chart BTC-USD                      | -     |
| gold_price                    | Yahoo GC=F                               | -     |
| sp500_*, dowjones_*, oil_*    | Yahoo ^GSPC, ^DJI, CL=F                  | -     |
| eth_close                     | Yahoo ETH-USD                            | -     |
| on-chain (n_transactions ...) | blockchain.com charts API                | -     |
| sopr, mvrv                    | bitcoin-data.com (BGeometrics) v1        | -     |
| fear_greed_value/class        | alternative.me                           | -     |
| usdt_dominance                | CoinGecko /global (snapshot harian)      | opsional COINGECKO_API_KEY |
| google_trends_bitcoin         | Google Trends via pytrends (di-rescale)  | -     |
| dxy, m2, cpi, pce, ...        | FRED API                                 | FRED_API_KEY |
"""
from datetime import datetime, timezone
from typing import Dict, Optional

import numpy as np
import pandas as pd

from iris_worker.data import http

HISTORY_START = "2017-01-01"


def _utc_dates(seconds) -> pd.DatetimeIndex:
    return pd.to_datetime(seconds, unit="s", utc=True).tz_localize(None).normalize()


# ----------------------------------------------------------------------------
# Yahoo Finance (keyless chart API)
# ----------------------------------------------------------------------------
YAHOO_SYMBOLS = {
    "btc": "BTC-USD",
    "eth": "ETH-USD",
    "gold": "GC=F",
    "sp500": "^GSPC",
    "dowjones": "^DJI",
    "oil": "CL=F",
}


def yahoo_daily(symbol: str, start: str = "2014-01-01") -> pd.DataFrame:
    """OHLCV harian. Baris dengan close NaN (hari libur yang ikut terkirim) dibuang."""
    p1 = int(pd.Timestamp(start, tz="UTC").timestamp())
    p2 = int(datetime.now(timezone.utc).timestamp()) + 86400
    j = http.get_json(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"period1": p1, "period2": p2, "interval": "1d", "events": "history"},
    )
    res = j["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    df = pd.DataFrame(
        {k: q.get(k) for k in ("open", "high", "low", "close", "volume")},
        index=_utc_dates(res["timestamp"]),
    )
    df = df[~df.index.duplicated(keep="last")].dropna(subset=["close"]).astype(float)
    if df.empty:
        raise ValueError(f"yahoo {symbol}: tidak ada data")
    return df


# ----------------------------------------------------------------------------
# blockchain.com charts (keyless)
# ----------------------------------------------------------------------------
BLOCKCHAIN_CHARTS = {
    "n_transactions": "n-transactions",
    "avg_block_size_mb": "avg-block-size",
    "avg_tx_per_block": "n-transactions-per-block",
    "avg_confirmation_time_min": "avg-confirmation-time",
    "median_confirmation_time_min": "median-confirmation-time",
    "avg_mining_difficulty": "difficulty",
    "avg_hashrate": "hash-rate",
    "miners_revenue_usd": "miners-revenue",
    "avg_transaction_fees_btc": "transaction-fees",
    "avg_transaction_fees_usd": "transaction-fees-usd",
    "cost_per_transaction_usd": "cost-per-transaction",
    "sent_coins_usd": "estimated-transaction-volume-usd",
    "output_volume_btc": "output-volume",
    "active_addresses": "n-unique-addresses",
    "coins_in_circulation": "total-bitcoins",
    "market_price_usd": "market-price",
}
# Di CSV training, total-bitcoins tercatat satu hari setelah tanggal API-nya.
BLOCKCHAIN_SHIFT_DAYS = {"coins_in_circulation": 1}


def blockchain_chart(name: str, timespan: str = "10years") -> pd.Series:
    j = http.get_json(
        f"https://api.blockchain.info/charts/{name}",
        params={"timespan": timespan, "format": "json", "sampled": "false"},
    )
    vals = j.get("values") or []
    if not vals:
        raise ValueError(f"blockchain.com {name}: kosong")
    s = pd.Series([v["y"] for v in vals], index=_utc_dates([v["x"] for v in vals]), dtype=float)
    return s.groupby(level=0).last()


def blockchain_onchain() -> pd.DataFrame:
    cols = {}
    for col, chart in BLOCKCHAIN_CHARTS.items():
        s = blockchain_chart(chart)
        shift = BLOCKCHAIN_SHIFT_DAYS.get(col, 0)
        if shift:
            s.index = s.index + pd.Timedelta(days=shift)
        cols[col] = s
    df = pd.DataFrame(cols)
    # Turunan (dicocokkan ke CSV training):
    #   avg_transaction_value_btc = output_volume / n_transactions
    #   avg_fee_to_reward_ratio   = n_transactions * fees_usd / miners_revenue
    df["avg_transaction_value_btc"] = df["output_volume_btc"] / df["n_transactions"]
    df["avg_fee_to_reward_ratio"] = (
        df["n_transactions"] * df["avg_transaction_fees_usd"] / df["miners_revenue_usd"]
    )
    return df


# ----------------------------------------------------------------------------
# bitcoin-data.com (BGeometrics) — SOPR & MVRV. Tier gratis: 7 hari terakhir
# ditahan (delayed), jadi nilai terbaru biasanya ~7 hari di belakang.
# ----------------------------------------------------------------------------
def bgeometrics(metric: str, start: str = HISTORY_START) -> pd.Series:
    j = http.get_json(f"https://bitcoin-data.com/v1/{metric}", params={"startday": start}, timeout=60)
    if not isinstance(j, list) or not j:
        raise ValueError(f"bitcoin-data.com {metric}: respons tidak terduga: {str(j)[:200]}")
    s = pd.Series(
        [float(r[metric]) if r.get(metric) is not None else np.nan for r in j],
        index=pd.to_datetime([r["d"] for r in j]),
        dtype=float,
    )
    return s.groupby(level=0).last()


def sopr_mvrv() -> pd.DataFrame:
    return pd.DataFrame({"sopr": bgeometrics("sopr"), "mvrv": bgeometrics("mvrv")})


# ----------------------------------------------------------------------------
# alternative.me — Fear & Greed
# ----------------------------------------------------------------------------
def fear_greed() -> pd.DataFrame:
    j = http.get_json("https://api.alternative.me/fng/", params={"limit": 0, "format": "json"})
    rows = j.get("data") or []
    if not rows:
        raise ValueError("alternative.me: kosong")
    df = pd.DataFrame(
        {
            "fear_greed_value": [float(r["value"]) for r in rows],
            "value_classification": [r["value_classification"] for r in rows],
        },
        index=_utc_dates([int(r["timestamp"]) for r in rows]),
    )
    return df[~df.index.duplicated(keep="first")].sort_index()


# ----------------------------------------------------------------------------
# CoinGecko — dominasi USDT. Riwayat dominasi tidak tersedia gratis, jadi ini
# snapshot yang dikumpulkan harian oleh job refresh (lihat state.py).
# ----------------------------------------------------------------------------
def usdt_dominance_now(api_key: str = "") -> float:
    headers = {"x-cg-demo-api-key": api_key} if api_key else None
    j = http.get_json("https://api.coingecko.com/api/v3/global", headers=headers)
    return float(j["data"]["market_cap_percentage"]["usdt"])


# ----------------------------------------------------------------------------
# Google Trends — skala 0-100 per jendela, jadi harus di-rescale ke seri
# tersimpan lewat overlap (lihat state.py).
# ----------------------------------------------------------------------------
def google_trends_raw(keyword: str = "bitcoin", timeframe: str = "today 3-m") -> pd.Series:
    from pytrends.request import TrendReq  # import lambat; hanya saat dipakai

    p = TrendReq(hl="en-US", tz=0, timeout=(10, 30))
    p.build_payload([keyword], timeframe=timeframe)
    df = p.interest_over_time()
    if df.empty:
        raise ValueError("google trends: kosong")
    if "isPartial" in df.columns:
        df = df[~df["isPartial"].astype(bool)]
    s = df[keyword].astype(float)
    s.index = pd.to_datetime(s.index).normalize()
    return s


# ----------------------------------------------------------------------------
# FRED — butuh FRED_API_KEY. Seri di-shift ke tanggal ketersediaan (release lag)
# supaya tidak ada lookahead; aturan lag dicocokkan dengan CSV training.
# ----------------------------------------------------------------------------
def _lag_days(days: int):
    return lambda idx: idx + pd.Timedelta(days=days)


def _quarter_end_plus(days: int):
    return lambda idx: idx + pd.offsets.QuarterEnd(0) + pd.Timedelta(days=days)


FRED_SERIES = {
    # kolom: (series_id, fungsi tanggal-observasi -> tanggal-tersedia)
    "cpi_headline": ("CPIAUCSL", _lag_days(45)),
    "core_pce": ("PCEPILFE", _lag_days(60)),
    "ppi": ("PPIACO", _lag_days(45)),
    "nonfarm_payrolls": ("PAYEMS", _lag_days(35)),
    "unemployment_rate": ("UNRATE", _lag_days(35)),
    "avg_hourly_earnings": ("CES0500000003", _lag_days(35)),
    "retail_sales": ("RSAFS", _lag_days(45)),
    "gdp_nominal": ("GDP", _quarter_end_plus(31)),
    "fomc_rate_upper": ("DFEDTARU", _lag_days(0)),
    "fomc_rate_lower": ("DFEDTARL", _lag_days(0)),
    "dxy": ("DTWEXBGS", _lag_days(0)),
    "m2_money_supply": ("M2SL", _lag_days(0)),
}


def fred_series(series_id: str, api_key: str, start: str = HISTORY_START) -> pd.Series:
    if not api_key:
        raise RuntimeError("FRED_API_KEY belum di-set")
    j = http.get_json(
        "https://api.stlouisfed.org/fred/series/observations",
        params={
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "observation_start": start,
        },
    )
    obs = j.get("observations") or []
    s = pd.Series(
        [float(o["value"]) if o["value"] not in (".", "") else np.nan for o in obs],
        index=pd.to_datetime([o["date"] for o in obs]),
        dtype=float,
    ).dropna()
    if s.empty:
        raise ValueError(f"FRED {series_id}: kosong")
    return s


def fred_all(api_key: str, columns: Optional[list] = None) -> Dict[str, pd.Series]:
    """{kolom: Series ber-index TANGGAL TERSEDIA}."""
    out = {}
    for col, (sid, avail) in FRED_SERIES.items():
        if columns and col not in columns:
            continue
        s = fred_series(sid, api_key)
        s.index = avail(s.index)
        out[col] = s.groupby(level=0).last()
    return out
