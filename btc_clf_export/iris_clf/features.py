"""
iris_clf.features
=================
SATU sumber kebenaran untuk pembuatan fitur klasifikasi.
Dipakai oleh notebook training DAN oleh repo (inference), jadi kolomnya
dijamin identik. Jangan diubah tanpa melatih ulang model.

Alur data:
  btc_master_2.csv  --load_master-->  data (OHLCV + kolom master)
  data              --build_engineered--> fitur teknikal turunan
  engineered + kolom non-teknikal master --build_universal--> domain "Universal"
  fred.csv + makro.csv + crossasset.csv  --build_macro-->     domain "MacroCrossAsset"
  technical.csv                          --build_technical--> domain "Technical"
  onchain.csv                            --build_onchain-->   domain "OnChain"
  feargreed.csv + g_trend.csv            --build_attention--> domain "AttentionSentiment"
"""
import os

import numpy as np
import pandas as pd

HORIZON = 7
LABEL_VOL_MULT = 0.5  # label: naik/turun hanya jika |return| > 0.5 x weekly_vol

FEAR_GREED_ORDER = {"Extreme Fear": 0, "Fear": 1, "Neutral": 2, "Greed": 3, "Extreme Greed": 4}
MASTER_INT_COLS = ["eth_price_is_backfilled", "next_halving_is_projected", "fomc_rate_changed"]
MASTER_EXCLUDE = ["btc_open", "btc_high", "btc_low", "btc_close", "btc_volume", "label", "market_price_usd"]
MACRO_FILES = ("fred.csv", "makro.csv", "crossasset.csv")


# ----------------------------------------------------------------------------
# Helper numerik
# ----------------------------------------------------------------------------
def _to_int(s):
    """bool/float -> int. NaN (mis. hari terakhir belum terisi) di-ffill, sisanya 0."""
    return s.astype(float).ffill().fillna(0).astype(int)


def safe_divide(numerator, denominator, index):
    denominator = pd.Series(denominator, index=index, dtype=float)
    return pd.Series(numerator, index=index, dtype=float) / denominator.replace(0, np.nan)


def calculate_rsi(close, window):
    change = close.diff()
    gain = change.clip(lower=0).ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    loss = (-change.clip(upper=0)).ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    rs = safe_divide(gain, loss, close.index)
    return 100 - (100 / (1 + rs))


def calculate_true_range(high, low, close):
    return pd.concat(
        [high - low, (high - close.shift(1)).abs(), (low - close.shift(1)).abs()], axis=1
    ).max(axis=1)


# ----------------------------------------------------------------------------
# Loader
# ----------------------------------------------------------------------------
def load_master(path):
    """Baca btc_master_2.csv + encoding yang sama persis dengan training."""
    data = pd.read_csv(path, index_col=0, parse_dates=True).sort_index()
    data["value_classification"] = data["value_classification"].map(FEAR_GREED_ORDER)
    for c in MASTER_INT_COLS:
        data[c] = _to_int(data[c])
    return data


def _read(category_dir, fname):
    return pd.read_csv(os.path.join(category_dir, fname), index_col=0, parse_dates=True)


def build_macro(category_dir, index):
    """Domain MacroCrossAsset = fred + makro + crossasset, di-reindex ke tanggal master."""
    fred = _read(category_dir, "fred.csv")
    fred["fomc_rate_changed"] = _to_int(fred["fomc_rate_changed"])
    makro = _read(category_dir, "makro.csv")
    cross = _read(category_dir, "crossasset.csv")
    cross["eth_price_is_backfilled"] = _to_int(cross["eth_price_is_backfilled"])
    return pd.concat([fred, makro, cross], axis=1).reindex(index)


def build_technical(category_dir, index):
    return _read(category_dir, "technical.csv").reindex(index)


def build_onchain(category_dir, index):
    return _read(category_dir, "onchain.csv").reindex(index)


def build_attention(category_dir, index):
    fg = _read(category_dir, "feargreed.csv")
    fg["value_classification"] = fg["value_classification"].map(FEAR_GREED_ORDER)
    gt = _read(category_dir, "g_trend.csv")
    return pd.concat([fg, gt], axis=1).reindex(index)


# ----------------------------------------------------------------------------
# Fitur teknikal turunan (copy persis dari notebook v4, cell 5)
# ----------------------------------------------------------------------------
def build_engineered(data):
    close = data["btc_close"].astype(float)
    high = data["btc_high"].astype(float)
    low = data["btc_low"].astype(float)
    open_ = data["btc_open"].astype(float)
    log_close = np.log(close.where(close > 0))
    return_1d = log_close.diff()
    true_range = calculate_true_range(high, low, close)

    eng = pd.DataFrame(index=data.index)

    for w in [3, 7, 14, 30, 60, 90]:
        eng[f"log_return_{w}d"] = log_close.diff(w)
        eng[f"volatility_{w}d"] = return_1d.rolling(w, min_periods=w).std()
        rh = close.rolling(w, min_periods=w).max()
        rl = close.rolling(w, min_periods=w).min()
        eng[f"drawdown_{w}d"] = safe_divide(close, rh, data.index) - 1
        eng[f"channel_pos_{w}d"] = safe_divide(close - rl, rh - rl, data.index)

    for w in [5, 8, 13, 21, 50, 100, 200]:
        ema = close.ewm(span=w, adjust=False, min_periods=w).mean()
        eng[f"ema_distance_{w}"] = safe_divide(close, ema, data.index) - 1
        eng[f"ema_slope_{w}"] = ema.pct_change()

    for w in [7, 14, 21, 28]:
        rsi = calculate_rsi(close, w)
        eng[f"rsi_{w}"] = rsi
        eng[f"rsi_distance50_{w}"] = rsi - 50

    for fast, slow, sig in [(12, 26, 9), (5, 35, 5)]:
        macd = close.ewm(span=fast, adjust=False).mean() - close.ewm(span=slow, adjust=False).mean()
        signal = macd.ewm(span=sig, adjust=False).mean()
        eng[f"macd_hist_{fast}_{slow}_{sig}"] = safe_divide(macd - signal, close, data.index)

    for w in [14, 20, 30]:
        mid = close.rolling(w, min_periods=w).mean()
        std = close.rolling(w, min_periods=w).std()
        upper, lower = mid + 2 * std, mid - 2 * std
        eng[f"bb_percent_b_{w}"] = safe_divide(close - lower, upper - lower, data.index)
        eng[f"bb_width_{w}"] = safe_divide(upper - lower, mid, data.index)

    for w in [7, 14, 21]:
        atr = true_range.ewm(alpha=1 / w, adjust=False, min_periods=w).mean()
        eng[f"atr_norm_{w}"] = safe_divide(atr, close, data.index)

    candle_range = high - low
    eng["candle_range_pct"] = safe_divide(candle_range, close, data.index)
    eng["candle_body_pct"] = safe_divide(close - open_, open_, data.index)
    eng["candle_close_location"] = safe_divide(close - low, candle_range, data.index)
    eng["candle_gap_pct"] = safe_divide(open_, close.shift(1), data.index) - 1
    return eng


def non_technical_columns(data, engineered):
    """Kolom master yang ikut domain Universal (di luar OHLCV/label & kolom teknikal)."""
    return [
        c for c in data.columns
        if c not in MASTER_EXCLUDE and c not in engineered.columns
        and (pd.api.types.is_numeric_dtype(data[c]) or pd.api.types.is_bool_dtype(data[c]))
    ]


def build_universal(data, non_tech_cols=None):
    eng = build_engineered(data)
    if non_tech_cols is None:
        non_tech_cols = non_technical_columns(data, eng)
    return eng.join(data[non_tech_cols], how="left")


# ----------------------------------------------------------------------------
# Label & volatilitas (HANYA untuk training)
# ----------------------------------------------------------------------------
def make_label(data, horizon=HORIZON, vol_mult=LABEL_VOL_MULT):
    """1 = naik berarti (> vol_mult x weekly_vol), 0 = turun berarti, NaN = noise/tanpa label."""
    close = data["btc_close"].astype(float)
    log_close = np.log(close.where(close > 0))
    return_1d = log_close.diff()
    fut = np.log(data["btc_close"].shift(-horizon) / data["btc_close"])
    weekly_vol = return_1d.rolling(horizon, min_periods=horizon).std() * np.sqrt(horizon)
    label = pd.Series(np.nan, index=data.index)
    label[fut > vol_mult * weekly_vol] = 1
    label[fut < -vol_mult * weekly_vol] = 0
    return label


# ----------------------------------------------------------------------------
# Satu pintu: semua frame domain dari folder data
# ----------------------------------------------------------------------------
SUPPORTED_DOMAINS = ("Technical", "OnChain", "MacroCrossAsset", "AttentionSentiment", "Universal")


def build_domain_frames(master_path, category_dir, domains, non_tech_cols=None):
    """
    Return (data, {nama_domain: DataFrame fitur untuk SEMUA tanggal}).
    domains: subset dari SUPPORTED_DOMAINS.
    """
    unknown = set(domains) - set(SUPPORTED_DOMAINS)
    if unknown:
        raise ValueError(f"Domain tidak dikenal: {sorted(unknown)}")
    data = load_master(master_path)
    builders = {
        "Technical": lambda: build_technical(category_dir, data.index),
        "OnChain": lambda: build_onchain(category_dir, data.index),
        "MacroCrossAsset": lambda: build_macro(category_dir, data.index),
        "AttentionSentiment": lambda: build_attention(category_dir, data.index),
        "Universal": lambda: build_universal(data, non_tech_cols),
    }
    return data, {name: builders[name]() for name in domains}
