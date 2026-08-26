# Monthly Forecasting Baseline — Status Report

**Tanggal**: 24 Agustus 2026
**Task**: Baseline model monthly forecasting untuk `btc_master_2.csv` dan `btc_master_3.csv`
**Referensi**: `bitcoin-time-series-forecasting.ipynb` (metode: univariate dulu, baru tambah eksogen bertahap)

---

## Ringkasan Eksekutif

| Dataset | Status | Coverage (Step terbaik) |
|---|---|---|
| `btc_master_2.csv` | ✅ **Sehat, siap dipakai** | 80.3% (Step 1 & 2) |
| `btc_master_3.csv` | ❌ **Belum layak dipakai** | 61.8% (setelah 4 perbaikan) |

Target coverage: **~80%** (karena prediksi range pakai Q10-Q90, secara teori 80% nilai aktual harus jatuh di dalamnya).

---

## Metodologi

1. **Model**: XGBoost Quantile Regression — bukan Linear Regression (lihat [Riwayat Perubahan Pendekatan](#riwayat-perubahan-pendekatan) di bawah untuk alasan)
2. **Output**: Range (batas bawah Q10, tengah/median Q50, batas atas Q90) — bukan angka tunggal
3. **Target**: Log return BTC close, 30 hari ke depan
4. **Validasi**: Walk-forward (bukan random split, mencegah data leakage)
5. **Fitur ditambah bertahap**:
   - Step 1: Univariate (lag & rolling stats dari `btc_close` + fitur kalender)
   - Step 2: + Technical Indicators (EMA, RSI, MACD, BB, ATR, dll)
   - Step 3: + FRED Macro (DXY, Gold, M2, CPI, PPI, SP500, dll)
   - Step 4: + Onchain (jika tersedia di dataset)
6. **Feature selection**: fitur dengan korelasi >0.95 dibuang otomatis (mencegah redundansi/multikolinearitas)

---

## Hasil: `btc_master_2.csv` (3124 baris, 2018-02-01 s/d 2026-08-21)

| Step | Fitur | Coverage rata-rata | MAE (mid) |
|---|---|---|---|
| 1 — Univariate | 12 | **80.3%** | 0.173 |
| 2 — +Technical | ~19 (setelah feature selection) | **80.2%** | 0.147 |
| 3 — +FRED Macro | ~35 (setelah feature selection) | 76.7% | 0.156 |
| 4 — +Onchain | sama seperti Step 3* | 76.8% | 0.156 |

*Kolom onchain (`mvrv_z_score`, `hashrate`, `difficulty`, dll) belum ditemukan di dataset ini — Step 4 secara efektif belum menambahkan data baru.

**Catatan penting**: performa paling lemah konsisten muncul di fold periode **2020-2022** (COVID crash + bull run 2021 + awal crash 2022). Ini kemungkinan karakteristik periode volatilitas ekstrem yang secara inheren sulit diprediksi, bukan indikasi masalah pada model atau fitur.

**Kesimpulan**: `btc_master_2.csv` sudah cukup sehat untuk dipakai sebagai baseline monthly forecasting, terutama Step 1-2 yang persis mencapai target coverage 80%.

---

## Hasil: `btc_master_3.csv` (366 baris, 2025-08-21 s/d 2026-08-21)

### Percobaan Perbaikan yang Sudah Dilakukan

| # | Pendekatan | Hasil (Coverage rata-rata) |
|---|---|---|
| 1 | Hapus fitur redundant (korelasi >0.95) | 54.8% - 58.3% |
| 2 | Threshold lebih ketat (korelasi >0.85) | ~55% (tidak membaik) |
| 3 | Regularisasi adaptif berdasarkan ukuran data | 50.4% - 53.5% |
| 4 | Kurangi jumlah fold (3→2, training window lebih besar) | 52.5% - **61.8%** (terbaik) |

### Temuan Diagnostic Penting

Saat investigasi kenapa Step 3 (+FRED) memperburuk performa, ditemukan:
- **Overfitting parah**: coverage TRAIN 91% vs TEST 33% pada percobaan awal (gap 58%)
- **Bug tersembunyi**: dengan regularisasi tertentu + data kecil (~76 baris), model XGBoost sempat **gagal membuat split sama sekali** — feature importance semua 0, model hanya memprediksi angka konstan tanpa peduli fitur apapun. Ini sudah diperbaiki (regularisasi adaptif), namun tidak memperbaiki coverage secara keseluruhan.
- **Fold periode Desember 2025 - April 2026** konsisten menjadi yang terburuk di SEMUA percobaan (coverage 14-37%), independen dari pendekatan perbaikan yang dicoba.

### Kesimpulan

Setelah 4 pendekatan perbaikan berbeda yang semuanya mentok di kisaran hasil serupa, disimpulkan ini adalah **keterbatasan struktural jumlah data** (366 baris / ~1 tahun terlalu sedikit untuk quantile regression yang reliable pada horizon 30 hari), **bukan masalah pemilihan model atau setting parameter**.

**`btc_master_3.csv` belum direkomendasikan untuk dipakai sebagai model forecasting utama** sampai:
- Histori data lebih panjang, ATAU
- Digunakan untuk keperluan lain yang tidak butuh reliability tinggi (misal EDA, brute force feature-lag correlation)

---

## Riwayat Perubahan Pendekatan

Untuk transparansi, berikut evolusi pendekatan yang diambil selama development:

1. **Awal**: Linear Regression, multivariate (OHLC sebagai fitur simultan) — **collapse parah** saat fitur ditambah (R² sampai -49 hingga -63) akibat multikolinearitas antar fitur macro yang secara alami saling berkorelasi tinggi.
2. **Setelah cek notebook referensi**: pendekatan dikoreksi ke univariate (fitur dari harga itu sendiri) + XGBoost (tree-based, robust terhadap multikolinearitas), sesuai metode di `bitcoin-time-series-forecasting.ipynb`.
3. **Setelah konfirmasi target output**: dari point-prediction (1 angka) ke Quantile Regression (range: bawah/tengah/atas), karena kebutuhan produk adalah window/range pergerakan harga, bukan angka tunggal.

---

## Rekomendasi Selanjutnya

1. **`btc_master_2.csv`** dipakai sebagai baseline utama untuk tahap berikutnya (tuning lanjutan, atau lanjut ke confluence meeting).
2. **`btc_master_3.csv`** disimpan sebagai dokumentasi eksplorasi — kode dan temuan sudah lengkap untuk direvisit nanti.
3. Investigasi lebih lanjut soal kenapa periode **2020-2022** (di `master_2`) dan **Des 2025-Apr 2026** (di `master_3`) konsisten menjadi yang paling sulit — kemungkinan perlu fitur tambahan khusus untuk mendeteksi rezim volatilitas ekstrem.

---

## File Terkait

- `baseline_v2_xgboost.py` — script utama (Step 1-4, Quantile Regression)
- `diagnose_step3.py` — script diagnostic (overfitting, feature importance, multikolinearitas)
- `docs/baseline_v3_quantile_btc_master_2.md` — hasil detail per fold, `master_2`
- `docs/baseline_v3_quantile_btc_master_3.md` — hasil detail per fold, `master_3`
