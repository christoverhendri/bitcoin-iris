"""
iris_worker.data.build
======================
Merakit btc_master_2.csv + kategori/{fred,makro,crossasset}.csv dengan kolom,
urutan, dan konstruksi yang sama dengan CSV training.

Aturan:
- Index harian UTC dari MASTER_START sampai `as_of` = candle harian TERAKHIR yang
  sudah tertutup (hari ini UTC tidak pernah ikut).
- Kolom turunan BTC (ema_*, rsi_14, macd*, bb_*, atr_14, log_return,
  realized_vol_14) dihitung dari riwayat OHLCV penuh lalu dipotong — rumusnya
  dicocokkan ke CSV training (EMA adjust=False, RSI/ATR Wilder, BB ddof=1,
  realized vol x sqrt(365)).
- Seri non-harian/akhir pekan di-ffill ke index harian (sama seperti training).
- Sumber yang gagal di-fallback ke nilai CSV sebelumnya untuk kolom tersebut,
  dan dilaporkan sebagai gagal — satu sumber mati tidak menghentikan refresh.
"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

import numpy as np
import pandas as pd

MASTER_START = "2018-02-01"

HALVINGS = [
    (pd.Timestamp("2012-11-28"), False),
    (pd.Timestamp("2016-07-09"), False),
    (pd.Timestamp("2020-05-11"), False),
    (pd.Timestamp("2024-04-20"), False),
    # Proyeksi yang dipakai CSV training. Jangan diubah tanpa retrain.
    (pd.Timestamp("2028-04-17"), True),
]

FRED_COLS = [
    "cpi_headline", "core_pce", "ppi", "nonfarm_payrolls", "unemployment_rate",
    "avg_hourly_earnings", "retail_sales", "gdp_nominal", "fomc_rate_upper",
    "fomc_rate_lower", "fomc_rate_changed",
]
MAKRO_COLS = ["dxy", "gold_price", "m2_money_supply", "usdt_dominance"]
CROSS_COLS = [
    "sp500_close", "sp500_volume", "dowjones_close", "dowjones_volume", "oil_close",
    "oil_volume", "eth_close", "eth_volume_usd", "eth_price_is_backfilled",
]


# ----------------------------------------------------------------------------
# Kolom turunan BTC
# ----------------------------------------------------------------------------
def btc_derived(ohlcv: pd.DataFrame) -> pd.DataFrame:
    c, h, l = ohlcv["close"], ohlcv["high"], ohlcv["low"]
    out = pd.DataFrame(index=ohlcv.index)
    out["btc_close"] = c
    out["btc_high"] = h
    out["btc_low"] = l
    out["btc_open"] = ohlcv["open"]
    out["btc_volume"] = ohlcv["volume"]
    for w in (5, 8, 13, 21):
        out[f"ema_{w}"] = c.ewm(span=w, adjust=False).mean()
    ch = c.diff()
    gain = ch.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    loss = (-ch.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    out["rsi_14"] = 100 - 100 / (1 + gain / loss)
    macd = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    sig = macd.ewm(span=9, adjust=False).mean()
    out["macd"], out["macd_signal"], out["macd_hist"] = macd, sig, macd - sig
    mid = c.rolling(20).mean()
    sd = c.rolling(20).std(ddof=1)
    out["bb_mid"], out["bb_upper"], out["bb_lower"] = mid, mid + 2 * sd, mid - 2 * sd
    out["bb_width"] = (out["bb_upper"] - out["bb_lower"]) / mid
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    out["atr_14"] = tr.ewm(alpha=1 / 14, adjust=False).mean()
    lr = np.log(c / c.shift())
    out["log_return"] = lr
    out["realized_vol_14"] = lr.rolling(14).std(ddof=1) * np.sqrt(365)
    return out


def halving_features(index: pd.DatetimeIndex) -> pd.DataFrame:
    dates = [d for d, _ in HALVINGS]
    rows = []
    for t in index:
        i = max(k for k, d in enumerate(dates) if d <= t)
        last, (nxt, projected) = dates[i], HALVINGS[i + 1]
        since, until = (t - last).days, (nxt - t).days
        phase = since / (since + until)
        rows.append((float(since), float(until), phase, np.sin(2 * np.pi * phase),
                     np.cos(2 * np.pi * phase), projected))
    return pd.DataFrame(
        rows, index=index,
        columns=["days_since_last_halving", "days_until_next_halving", "halving_cycle_phase",
                 "halving_phase_sin", "halving_phase_cos", "next_halving_is_projected"],
    )


def align(s: pd.Series, index: pd.DatetimeIndex) -> pd.Series:
    """Ffill seri tak-beraturan ke index harian (nilai sebelum index awal ikut jadi seed ffill)."""
    s = s[~s.index.duplicated(keep="last")].sort_index()
    full = s.reindex(s.index.union(index)).ffill()
    return full.reindex(index)


# ----------------------------------------------------------------------------
# Laporan per sumber
# ----------------------------------------------------------------------------
@dataclass
class SourceResult:
    key: str
    ok: bool
    columns: List[str]
    last_obs: Optional[str] = None
    rows: int = 0
    error: Optional[str] = None
    stale_days: Optional[int] = None

    def as_dict(self):
        return self.__dict__.copy()


@dataclass
class BuildResult:
    as_of: str
    master: pd.DataFrame
    fred: pd.DataFrame
    makro: pd.DataFrame
    cross: pd.DataFrame
    sources: Dict[str, SourceResult] = field(default_factory=dict)

    def write(self, data_dir: Path) -> None:
        data_dir = Path(data_dir)
        (data_dir / "kategori").mkdir(parents=True, exist_ok=True)
        self.master.to_csv(data_dir / "btc_master_2.csv", index_label="date")
        self.fred.to_csv(data_dir / "kategori" / "fred.csv", index_label="date")
        self.makro.to_csv(data_dir / "kategori" / "makro.csv", index_label="date")
        self.cross.to_csv(data_dir / "kategori" / "crossasset.csv", index_label="date")


def assemble(
    btc_ohlcv: pd.DataFrame,
    parts: Dict[str, pd.DataFrame],
    template_columns: List[str],
    as_of: pd.Timestamp,
) -> Dict[str, pd.DataFrame]:
    """
    Rakit frame master & kategori. `parts` = {nama: DataFrame kolom-mentah ber-index
    tanggal}. Semua kolom di template harus terisi dari salah satu part atau dari
    turunan BTC/halving.
    """
    index = pd.date_range(MASTER_START, as_of, freq="D")
    btc = btc_ohlcv[btc_ohlcv.index <= as_of]
    derived = btc_derived(btc).reindex(index)
    master = pd.DataFrame(index=index)
    for c in derived.columns:
        master[c] = derived[c]
    hv = halving_features(index)
    raw: Dict[str, pd.Series] = {}
    for df in parts.values():
        for c in df.columns:
            raw[c] = df[c]
    for c in template_columns:
        if c in master.columns:
            continue
        if c in hv.columns:
            master[c] = hv[c]
        elif c in raw:
            master[c] = align(raw[c], index)
        elif c == "fomc_rate_changed":
            continue  # dihitung di bawah dari fomc_rate_upper
        elif c == "eth_volume_usd":
            master[c] = 0.0  # konstan 0 di CSV training
        elif c == "eth_price_is_backfilled":
            master[c] = False  # konstan False di CSV training
        else:
            raise KeyError(f"kolom master '{c}' tidak punya sumber")
    up = master["fomc_rate_upper"]
    master["fomc_rate_changed"] = up.ne(up.shift()) & up.shift().notna()
    master = master[template_columns]
    return {
        "master": master,
        "fred": master[FRED_COLS],
        "makro": master[MAKRO_COLS],
        "cross": master[CROSS_COLS],
    }


def last_closed_day(now: Optional[pd.Timestamp] = None) -> pd.Timestamp:
    """Candle harian UTC terakhir yang sudah tertutup = kemarin (UTC)."""
    now = now if now is not None else pd.Timestamp.now(tz="UTC")
    if now.tzinfo is not None:
        now = now.tz_convert("UTC").tz_localize(None)
    return now.normalize() - pd.Timedelta(days=1)


def run_fetch(key: str, columns: List[str], fn: Callable[[], pd.DataFrame], log) -> tuple:
    """Jalankan satu fetcher; kembalikan (DataFrame|None, SourceResult)."""
    try:
        df = fn()
        last = df.dropna(how="all").index.max()
        log(f"  [ok]   {key:16s} {len(df):5d} baris, obs terakhir {last.date()}")
        return df, SourceResult(key, True, columns, str(last.date()), int(len(df)))
    except Exception as e:  # noqa: BLE001 — satu sumber gagal tidak boleh menghentikan refresh
        log(f"  [GAGAL] {key:16s} {type(e).__name__}: {str(e)[:200]}")
        return None, SourceResult(key, False, columns, error=f"{type(e).__name__}: {e}"[:500])
