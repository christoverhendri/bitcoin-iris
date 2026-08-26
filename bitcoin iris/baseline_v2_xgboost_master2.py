"""
Task: Monthly Forecasting — sesuai notebook referensi (bitcoin-time-series-forecasting.ipynb)

KOREKSI dari versi sebelumnya:
    - Notebook referensi TIDAK pakai Linear Regression. Model yang dipakai:
      LSTM, XGBoost, Prophet, ARIMA -- semuanya UNIVARIATE (cuma dari harga
      itu sendiri, bukan OHLC sebagai 5 kolom fitur simultan).
    - "OHLCV doang" di jobdesk = univariate (fitur dari harga BTC itu sendiri
      saja), BUKAN multivariate regression pakai Open+High+Low+Close+Volume
      sebagai fitur terpisah.
    - Model dipilih: XGBoost (paling mudah di-extend dengan fitur eksogen
      di step berikutnya, dan robust terhadap multikolinearitas -- ini juga
      yang menjelaskan kenapa Linear Regression collapse di versi sebelumnya).

Struktur bertahap (sesuai arahan koor: "OHLCV dulu, pelan-pelan tambah eksogen"):
    Step 1: Univariate -- fitur dari btc_close saja (lag & rolling stats)
    Step 2: + Technical Indicators (EMA, RSI, MACD, dll)
    Step 3: + FRED Macro (DXY, Gold, M2, CPI, dll)
    Step 4: + Onchain (kalau tersedia di dataset)

Target: log return BTC close, 30 hari ke depan (regresi)
Validasi: Walk-forward (mencegah data leakage)

Cara pakai:
    python baseline_v2_xgboost.py
"""

import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, r2_score
import os

RAW_DIR = "data/raw"
DOCS_DIR = "docs"
os.makedirs(DOCS_DIR, exist_ok=True)

SOURCE_FILE = "btc_master_2.csv"  # ganti ke btc_master_3.csv untuk dataset kedua

FORECAST_HORIZON_DAYS = 30
N_WALK_FORWARD_SPLITS = 5
N_SPLITS_OVERRIDE = {"btc_master_3.csv": 3}

TECHNICAL_COLS = [
    "ema_5", "ema_8", "ema_13", "ema_21", "rsi_14",
    "macd", "macd_signal", "macd_hist",
    "bb_mid", "bb_upper", "bb_lower", "bb_width",
    "atr_14", "log_return", "realized_vol_14",
]

FRED_MACRO_COLS = [
    "dxy", "gold_price", "m2_money_supply", "usdt_dominance",
    "cpi_headline", "core_pce", "ppi", "nonfarm_payrolls",
    "unemployment_rate", "avg_hourly_earnings", "retail_sales", "gdp_nominal",
    "fomc_rate_upper", "fomc_rate_lower", "fomc_rate_changed",
    "sp500_close", "sp500_volume", "dowjones_close", "dowjones_volume",
    "oil_close", "oil_volume", "eth_close",
    "google_trends_bitcoin", "fear_greed_value",
]

ONCHAIN_COLS = [
    "sopr", "mvrv", "mvrv_z_score", "hashrate", "difficulty",
    "active_addresses", "transaction_count", "avg_transaction_fees",
    "exchange_netflow", "puell_multiple", "nvt_ratio",
]


def remove_redundant_features(df, feature_cols, threshold=0.95):
    """
    Hapus fitur yang saling berkorelasi > threshold (redundant secara matematis).
    Strategi: untuk tiap pasangan berkorelasi tinggi, buang salah satu (yang
    urutannya belakangan di list -- fitur yang lebih dulu/dasar dipertahankan).

    Ditemukan dari diagnose_step3.py: 169 pasangan fitur dengan korelasi >0.85,
    beberapa bahkan PERSIS 1.0 (misal close_lag_1 == ema_5). Ini bikin model
    overfit parah (coverage train 91% vs test 16%).
    """
    corr = df[feature_cols].corr().abs()
    to_drop = set()

    for i in range(len(corr.columns)):
        if corr.columns[i] in to_drop:
            continue
        for j in range(i + 1, len(corr.columns)):
            if corr.columns[j] in to_drop:
                continue
            if corr.iloc[i, j] > threshold:
                to_drop.add(corr.columns[j])  # buang yang belakangan

    kept = [c for c in feature_cols if c not in to_drop]
    if to_drop:
        print(f"  [FEATURE SELECTION] Dibuang ({len(to_drop)} fitur redundant, korelasi>{threshold}): {sorted(to_drop)}")
    return kept


def load_and_prepare(filepath):
    df = pd.read_csv(filepath)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    if "fomc_rate_changed" in df.columns and df["fomc_rate_changed"].dtype == bool:
        df["fomc_rate_changed"] = df["fomc_rate_changed"].astype(int)
    return df


def create_target(df, horizon=FORECAST_HORIZON_DAYS):
    df = df.copy()
    df["target_log_return_30d"] = np.log(df["btc_close"].shift(-horizon) / df["btc_close"])
    return df


def build_features_step1_univariate(df):
    """
    Step 1: UNIVARIATE -- sesuai notebook referensi, fitur HANYA dari
    btc_close itu sendiri (lag values + rolling stats + calendar features).
    TIDAK ada Open/High/Low/Volume sebagai fitur terpisah, TIDAK ada
    fitur eksternal apapun.
    """
    df = df.copy()

    # Lag features (nilai close di masa lalu -- pola umum di time series forecasting)
    for lag in [1, 3, 7, 14, 30]:
        df[f"close_lag_{lag}"] = df["btc_close"].shift(lag)

    # Rolling statistics (dihitung murni dari close, tidak butuh data lain)
    df["close_roll_mean_7"] = df["btc_close"].rolling(7).mean()
    df["close_roll_std_7"] = df["btc_close"].rolling(7).std()
    df["close_roll_mean_30"] = df["btc_close"].rolling(30).mean()

    # Calendar features (persis seperti pendekatan XGBoost di notebook referensi)
    df["dayofweek"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["quarter"] = df["date"].dt.quarter
    df["dayofyear"] = df["date"].dt.dayofyear

    feature_cols = [
        "close_lag_1", "close_lag_3", "close_lag_7", "close_lag_14", "close_lag_30",
        "close_roll_mean_7", "close_roll_std_7", "close_roll_mean_30",
        "dayofweek", "month", "quarter", "dayofyear",
    ]
    return df, feature_cols


def build_features_step2(df):
    df, base_cols = build_features_step1_univariate(df)
    available = [c for c in TECHNICAL_COLS if c in df.columns]
    missing = [c for c in TECHNICAL_COLS if c not in df.columns]
    if missing:
        print(f"  [INFO] Technical tidak ditemukan (skip): {missing}")
    combined = base_cols + available
    combined = remove_redundant_features(df, combined, threshold=0.95)
    return df, combined


def build_features_step3(df):
    df, base_cols = build_features_step2(df)
    available = [c for c in FRED_MACRO_COLS if c in df.columns]
    missing = [c for c in FRED_MACRO_COLS if c not in df.columns]
    if missing:
        print(f"  [INFO] FRED macro tidak ditemukan (skip): {missing}")
    combined = base_cols + available
    combined = remove_redundant_features(df, combined, threshold=0.95)
    return df, combined


def build_features_step4(df):
    df, base_cols = build_features_step3(df)
    available = [c for c in ONCHAIN_COLS if c in df.columns]
    missing = [c for c in ONCHAIN_COLS if c not in df.columns]
    if missing:
        print(f"  [INFO] Onchain tidak ditemukan (skip): {missing}")
    if not available:
        print(f"  [SKIP STEP 4] Tidak ada kolom onchain di dataset ini.")
        return None, None
    combined = base_cols + available
    combined = remove_redundant_features(df, combined, threshold=0.95)
    return df, combined


QUANTILES = {"lower": 0.10, "mid": 0.50, "upper": 0.90}


def walk_forward_validation_quantile(df, feature_cols, target_col, n_splits):
    """
    Quantile Regression pakai XGBoost -- untuk dapetin RANGE (batas bawah,
    tengah/median, batas atas), bukan cuma 1 angka prediksi.

    Ini pendekatan yang dipakai menggantikan Monte Carlo Dropout: MC Dropout
    aslinya butuh model neural network (LSTM) dengan dropout tetap aktif saat
    prediksi, di-run berkali-kali untuk dapat distribusi. Quantile Regression
    dengan XGBoost mencapai TUJUAN YANG SAMA (dapat range/interval prediksi)
    dengan cara lebih langsung dan tetap pakai fondasi model yang sudah
    terbukti stabil (XGBoost, bukan Linear Regression yang sebelumnya collapse).

    Coverage (berapa % nilai aktual yang jatuh di dalam range prediksi) juga
    dihitung -- ini metrik yang LEBIH RELEVAN untuk use case range forecasting
    dibanding R2 (yang cocoknya untuk point prediction).
    """
    df_valid = df.dropna(subset=feature_cols + [target_col]).reset_index(drop=True)
    n = len(df_valid)
    fold_size = n // (n_splits + 1)
    results = []

    for i in range(1, n_splits + 1):
        train_end = fold_size * i
        test_end = fold_size * (i + 1)
        train = df_valid.iloc[:train_end]
        test = df_valid.iloc[train_end:test_end]
        if len(test) == 0:
            continue

        X_train, y_train = train[feature_cols], train[target_col]
        X_test, y_test = test[feature_cols], test[target_col]

        preds = {}
        for q_name, q_val in QUANTILES.items():
            model = xgb.XGBRegressor(
                objective="reg:quantileerror",
                quantile_alpha=q_val,
                n_estimators=100,
                max_depth=3,  # diturunkan dari 5 -- pohon lebih dangkal, kurang mudah overfit
                learning_rate=0.05,  # diturunkan dari 0.1 -- belajar lebih pelan/hati-hati
                colsample_bytree=0.7,
                subsample=0.8,  # baru: subsample baris juga, tambahan regularisasi
                min_child_weight=10,  # dinaikkan dari 5 -- butuh lebih banyak data per split
                reg_alpha=1.0,  # baru: L1 regularization
                reg_lambda=2.0,  # baru: L2 regularization
                random_state=42,
            )
            model.fit(X_train, y_train, verbose=False)
            preds[q_name] = model.predict(X_test)

        # Coverage: berapa % nilai aktual yang jatuh di dalam [lower, upper]
        y_test_arr = y_test.values
        in_range = (y_test_arr >= preds["lower"]) & (y_test_arr <= preds["upper"])
        coverage = in_range.mean()

        # Rata-rata lebar range (semakin sempit semakin "berguna" -- tapi
        # harus tetap dibarengi coverage tinggi, kalau tidak berarti terlalu
        # percaya diri dan sering meleset)
        avg_width = (preds["upper"] - preds["lower"]).mean()

        mae_mid = mean_absolute_error(y_test, preds["mid"])

        results.append({
            "fold": i, "test_start": test["date"].min(), "test_end": test["date"].max(),
            "n_test": len(test), "mae_mid": mae_mid,
            "coverage": coverage, "avg_range_width": avg_width,
        })
        print(f"  Fold {i}: test={test['date'].min().date()}->{test['date'].max().date()} "
              f"({len(test)}) | MAE(mid)={mae_mid:.4f} | Coverage={coverage:.1%} "
              f"(target ~80%) | Avg width={avg_width:.4f}")

    return pd.DataFrame(results)


def walk_forward_validation(df, feature_cols, target_col, n_splits):
    """Point prediction (1 angka) -- dipakai di Step 1-4 sebelumnya untuk MAE/R2."""
    df_valid = df.dropna(subset=feature_cols + [target_col]).reset_index(drop=True)
    n = len(df_valid)
    fold_size = n // (n_splits + 1)
    results = []

    for i in range(1, n_splits + 1):
        train_end = fold_size * i
        test_end = fold_size * (i + 1)
        train = df_valid.iloc[:train_end]
        test = df_valid.iloc[train_end:test_end]
        if len(test) == 0:
            continue

        X_train, y_train = train[feature_cols], train[target_col]
        X_test, y_test = test[feature_cols], test[target_col]

        # XGBoost -- tree-based, tidak butuh scaling, robust terhadap
        # multikolinearitas (beda dari Linear Regression sebelumnya).
        model = xgb.XGBRegressor(
            objective="reg:squarederror",
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            colsample_bytree=0.8,
            min_child_weight=5,
            random_state=42,
        )
        model.fit(X_train, y_train, verbose=False)
        preds = model.predict(X_test)

        mae = mean_absolute_error(y_test, preds)
        r2 = r2_score(y_test, preds) if len(y_test) > 1 else np.nan

        results.append({
            "fold": i, "train_start": train["date"].min(), "train_end": train["date"].max(),
            "test_start": test["date"].min(), "test_end": test["date"].max(),
            "n_train": len(train), "n_test": len(test), "mae": mae, "r2": r2,
        })
        print(f"  Fold {i}: train={train['date'].min().date()}->{train['date'].max().date()} "
              f"({len(train)}) | test={test['date'].min().date()}->{test['date'].max().date()} "
              f"({len(test)}) | MAE={mae:.4f} | R2={r2:.4f}")

    return pd.DataFrame(results)


def df_to_markdown_manual(df):
    cols = list(df.columns)
    header = "| " + " | ".join(str(c) for c in cols) + " |"
    sep = "|" + "|".join(["---"] * len(cols)) + "|"
    rows = ["| " + " | ".join(str(row[c]) for c in cols) + " |" for _, row in df.iterrows()]
    return "\n".join([header, sep] + rows)


def generate_report(source_file, all_results, all_feats):
    lines = [f"# Monthly Forecasting v2 — XGBoost (sesuai notebook referensi)\n"]
    lines.append(f"Generated: {pd.Timestamp.now()}\n")
    lines.append(f"Source: `{source_file}` | Target: log return 30 hari | Model: XGBoost\n")

    step_names = ["Step 1: Univariate (lag+rolling+calendar)", "Step 2: +Technical",
                  "Step 3: +FRED Macro", "Step 4: +Onchain"]

    for i, (results, feats) in enumerate(zip(all_results, all_feats)):
        if results is None:
            continue
        lines.append(f"## {step_names[i]} ({len(feats)} fitur)")
        lines.append(f"Fitur: {feats}\n")
        lines.append(df_to_markdown_manual(results))
        lines.append(f"\n- MAE rata-rata: {results['mae'].mean():.4f}")
        lines.append(f"- R2 rata-rata: {results['r2'].mean():.4f}\n")

    lines.append("## Kesimpulan")
    valid_results = [(i, r) for i, r in enumerate(all_results) if r is not None]
    for i in range(1, len(valid_results)):
        prev_idx, prev = valid_results[i-1]
        cur_idx, cur = valid_results[i]
        r2_diff = cur['r2'].mean() - prev['r2'].mean()
        lines.append(f"- {step_names[prev_idx]} -> {step_names[cur_idx]}: perubahan R2 {r2_diff:+.4f}")

    path = os.path.join(DOCS_DIR, f"baseline_v2_xgboost_{source_file.replace('.csv','')}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\nReport saved: {path}")


def generate_report_quantile(source_file, all_results, all_feats):
    lines = [f"# Monthly Forecasting v3 — Quantile Regression (RANGE output)\n"]
    lines.append(f"Generated: {pd.Timestamp.now()}\n")
    lines.append(f"Source: `{source_file}` | Target: log return 30 hari")
    lines.append(f"Output: batas bawah (Q10), tengah/median (Q50), batas atas (Q90)")
    lines.append(f"Model: XGBoost Quantile Regression (menggantikan Monte Carlo Dropout")
    lines.append(f"-- lihat catatan di bawah kenapa)\n")

    step_names = ["Step 1: Univariate (lag+rolling+calendar)", "Step 2: +Technical",
                  "Step 3: +FRED Macro", "Step 4: +Onchain"]

    for i, (results, feats) in enumerate(zip(all_results, all_feats)):
        if results is None:
            continue
        lines.append(f"## {step_names[i]} ({len(feats)} fitur)")
        lines.append(f"Fitur: {feats}\n")
        lines.append(df_to_markdown_manual(results))
        lines.append(f"\n- Coverage rata-rata: {results['coverage'].mean():.1%} (target ideal ~80%, karena Q10-Q90)")
        lines.append(f"- MAE (titik tengah) rata-rata: {results['mae_mid'].mean():.4f}")
        lines.append(f"- Lebar range rata-rata: {results['avg_range_width'].mean():.4f}\n")

    lines.append("## Cara Membaca Hasil Ini")
    lines.append("- **Coverage**: persentase kejadian dimana nilai aktual BENERAN jatuh di")
    lines.append("  dalam range yang diprediksi. Target idealnya sekitar 80% (karena kita")
    lines.append("  pakai Q10-Q90, secara teori 80% data seharusnya ada di dalam range itu).")
    lines.append("  Coverage jauh di bawah 80% = range terlalu sempit/terlalu percaya diri.")
    lines.append("  Coverage jauh di atas 80% = range terlalu lebar, kurang informatif.")
    lines.append("- **Lebar range**: makin sempit, makin actionable buat user -- TAPI cuma")
    lines.append("  valid kalau coverage-nya tetap terjaga di sekitar 80%.\n")

    lines.append("## Catatan Penting: Kenapa Quantile Regression, bukan Monte Carlo Dropout")
    lines.append("Notebook referensi (bitcoin-time-series-forecasting.ipynb) memang punya")
    lines.append("layer Dropout di model LSTM-nya, TAPI itu dropout biasa untuk regularisasi")
    lines.append("saat training (otomatis nonaktif saat prediksi) -- BUKAN Monte Carlo Dropout")
    lines.append("asli (yang butuh dropout tetap aktif saat prediksi, di-run berkali-kali untuk")
    lines.append("membentuk distribusi). Quantile Regression dipilih sebagai pengganti karena:")
    lines.append("mencapai tujuan yang sama (dapat range bawah/tengah/atas), lebih langsung")
    lines.append("diimplementasikan, dan tetap memakai fondasi XGBoost yang sudah terbukti jauh")
    lines.append("lebih stabil dibanding Linear Regression (yang sebelumnya collapse parah saat")
    lines.append("fitur ditambah).")

    path = os.path.join(DOCS_DIR, f"baseline_v3_quantile_{source_file.replace('.csv','')}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\nReport saved: {path}")


if __name__ == "__main__":
    print(f"=== Monthly Forecasting v3 (Quantile Regression -- RANGE output): {SOURCE_FILE} ===\n")
    print(f"Output: batas bawah (Q10), tengah/median (Q50), batas atas (Q90)\n")
    filepath = os.path.join(RAW_DIR, SOURCE_FILE)
    df_raw = load_and_prepare(filepath)
    print(f"Loaded: {len(df_raw)} rows, {df_raw['date'].min().date()} -> {df_raw['date'].max().date()}\n")
    df_raw = create_target(df_raw)
    n_splits = N_SPLITS_OVERRIDE.get(SOURCE_FILE, N_WALK_FORWARD_SPLITS)

    all_results, all_feats = [], []

    print("--- STEP 1: Univariate (dari btc_close saja) ---")
    df1, feat1 = build_features_step1_univariate(df_raw)
    r1 = walk_forward_validation_quantile(df1, feat1, "target_log_return_30d", n_splits)
    print(f"Coverage rata-rata: {r1['coverage'].mean():.1%} | MAE(mid): {r1['mae_mid'].mean():.4f}\n")
    all_results.append(r1); all_feats.append(feat1)

    print("--- STEP 2: + Technical Indicators ---")
    df2, feat2 = build_features_step2(df_raw)
    r2 = walk_forward_validation_quantile(df2, feat2, "target_log_return_30d", n_splits)
    print(f"Coverage rata-rata: {r2['coverage'].mean():.1%} | MAE(mid): {r2['mae_mid'].mean():.4f}\n")
    all_results.append(r2); all_feats.append(feat2)

    print("--- STEP 3: + FRED Macro ---")
    df3, feat3 = build_features_step3(df_raw)
    r3 = walk_forward_validation_quantile(df3, feat3, "target_log_return_30d", n_splits)
    print(f"Coverage rata-rata: {r3['coverage'].mean():.1%} | MAE(mid): {r3['mae_mid'].mean():.4f}\n")
    all_results.append(r3); all_feats.append(feat3)

    print("--- STEP 4: + Onchain (jika tersedia) ---")
    df4, feat4 = build_features_step4(df_raw)
    if df4 is not None:
        r4 = walk_forward_validation_quantile(df4, feat4, "target_log_return_30d", n_splits)
        print(f"Coverage rata-rata: {r4['coverage'].mean():.1%} | MAE(mid): {r4['mae_mid'].mean():.4f}\n")
        all_results.append(r4); all_feats.append(feat4)
    else:
        all_results.append(None); all_feats.append(None)

    generate_report_quantile(SOURCE_FILE, all_results, all_feats)