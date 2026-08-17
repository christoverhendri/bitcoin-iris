# Validation Report — Daily Datasets (Pre-Merge)

Generated: 2026-08-17 16:04:17.910362

Scope: missing values, gap tanggal, outlier (IQR), konsistensi format tanggal.

Dilakukan per file SEBELUM merge, sesuai requirement task.


## Ringkasan

| File | Rows | Cols | Date Range | Gap Tanggal | Format Konsisten |
|---|---|---|---|---|---|
| btc_daily_features.csv | 4241 | 28 | 2015-01-01 -> 2026-08-11 | 0 hari | Ya |
| fear_greed_index.csv | 3116 | 3 | 2018-02-01 -> 2026-08-13 | 0 hari | Ya |
| dxy_index_daily_ffilled.csv | 4243 | 2 | 2015-01-01 -> 2026-08-13 | 0 hari | Ya |
| gold_price_daily_ffilled.csv | 4243 | 2 | 2015-01-01 -> 2026-08-13 | 0 hari | Ya |
| m2_money_supply_daily_ffilled.csv | 4243 | 2 | 2015-01-01 -> 2026-08-13 | 0 hari | Ya |
| usdt_dominance.csv | 4177 | 2 | 2015-03-08 -> 2026-08-13 | 0 hari | Ya |

---


## btc_daily_features.csv

- Rows: 4241 | Cols: 28
- Kolom tanggal terdeteksi: `date`
- Date range: 2015-01-01 00:00:00 -> 2026-08-11 00:00:00

### 1. Missing Values
| Kolom | Jumlah NaN | % NaN |
|---|---|---|
| RSI_14 | 2 | 0.05% |
| BB_mid | 19 | 0.45% |
| BB_upper | 19 | 0.45% |
| BB_lower | 19 | 0.45% |
| BB_width | 19 | 0.45% |
| log_return | 1 | 0.02% |
| realized_vol_14 | 14 | 0.33% |

### 2. Gap Tanggal
Tidak ada gap, sequence tanggal lengkap.

### 3. Konsistensi Format Tanggal
Semua baris punya format tanggal yang konsisten dan bisa di-parse.

### 4. Outlier (IQR Method)
| Kolom | Jumlah Outlier | % Outlier | Batas Bawah | Batas Atas | Min Outlier | Max Outlier |
|---|---|---|---|---|---|---|
| Close | 22 | 0.52% | -64554.6288 | 118142.7648 | 118359.5781 | 124752.5312 |
| High | 12 | 0.28% | -66338.6433 | 121374.8235 | 122321.0938 | 126198.0703 |
| Low | 49 | 1.16% | -62621.2604 | 114692.6625 | 114723.6797 | 123196.0469 |
| Open | 22 | 0.52% | -64533.8076 | 118099.6533 | 118365.7812 | 124752.1406 |
| Volume | 80 | 1.89% | -43619294449.0 | 81709837415.0 | 82051616861 | 350967941479 |
| EMA_5 | 28 | 0.66% | -64372.801 | 117760.0944 | 117874.9731 | 122466.6595 |
| EMA_8 | 26 | 0.61% | -64277.5068 | 117548.4102 | 117581.0082 | 121431.2713 |
| EMA_13 | 25 | 0.59% | -64025.7817 | 117104.5721 | 117158.8019 | 120001.9311 |
| EMA_21 | 31 | 0.73% | -63406.8429 | 116079.4084 | 116149.2298 | 118399.4553 |
| RSI_14 | 19 | 0.45% | 15.6644 | 89.9361 | 9.9202 | 94.3022 |
| MACD | 877 | 20.68% | -1225.9433 | 1392.9671 | -5927.4532 | 7049.2176 |
| MACD_signal | 896 | 21.13% | -1148.0188 | 1316.5179 | -5265.6068 | 6427.7841 |
| MACD_hist | 953 | 22.47% | -357.5148 | 363.9265 | -2261.4938 | 1882.8556 |
| BB_mid | 36 | 0.85% | -63668.1615 | 116588.9035 | 116604.5598 | 118311.752 |
| BB_lower | 99 | 2.34% | -56632.7979 | 103651.4107 | 103799.5288 | 116638.3205 |
| BB_width | 151 | 3.58% | -0.1537 | 0.5534 | 0.5549 | 1.0619 |
| log_return | 392 | 9.25% | -0.0544 | 0.0575 | -0.4647 | 0.2251 |
| realized_vol_14 | 183 | 4.33% | -0.1578 | 1.2194 | 1.2203 | 2.817 |

## fear_greed_index.csv

- Rows: 3116 | Cols: 3
- Kolom tanggal terdeteksi: `date`
- Date range: 2018-02-01 00:00:00 -> 2026-08-13 00:00:00

### 1. Missing Values
Tidak ada missing values.

### 2. Gap Tanggal
Tidak ada gap, sequence tanggal lengkap.

### 3. Konsistensi Format Tanggal
Semua baris punya format tanggal yang konsisten dan bisa di-parse.

### 4. Outlier (IQR Method)
Tidak ada outlier signifikan terdeteksi (IQR method).

## dxy_index_daily_ffilled.csv

- Rows: 4243 | Cols: 2
- Kolom tanggal terdeteksi: `date`
- Date range: 2015-01-01 00:00:00 -> 2026-08-13 00:00:00

### 1. Missing Values
Tidak ada missing values.

### 2. Gap Tanggal
Tidak ada gap, sequence tanggal lengkap.

### 3. Konsistensi Format Tanggal
Semua baris punya format tanggal yang konsisten dan bisa di-parse.

### 4. Outlier (IQR Method)
Tidak ada outlier signifikan terdeteksi (IQR method).

## gold_price_daily_ffilled.csv

- Rows: 4243 | Cols: 2
- Kolom tanggal terdeteksi: `date`
- Date range: 2015-01-01 00:00:00 -> 2026-08-13 00:00:00

### 1. Missing Values
Tidak ada missing values.

### 2. Gap Tanggal
Tidak ada gap, sequence tanggal lengkap.

### 3. Konsistensi Format Tanggal
Semua baris punya format tanggal yang konsisten dan bisa di-parse.

### 4. Outlier (IQR Method)
| Kolom | Jumlah Outlier | % Outlier | Batas Bawah | Batas Atas | Min Outlier | Max Outlier |
|---|---|---|---|---|---|---|
| gold_price | 500 | 11.78% | 217.525 | 3042.525 | 3056.5 | 5318.3999 |

## m2_money_supply_daily_ffilled.csv

- Rows: 4243 | Cols: 2
- Kolom tanggal terdeteksi: `date`
- Date range: 2015-01-01 00:00:00 -> 2026-08-13 00:00:00

### 1. Missing Values
Tidak ada missing values.

### 2. Gap Tanggal
Tidak ada gap, sequence tanggal lengkap.

### 3. Konsistensi Format Tanggal
Semua baris punya format tanggal yang konsisten dan bisa di-parse.

### 4. Outlier (IQR Method)
Tidak ada outlier signifikan terdeteksi (IQR method).

## usdt_dominance.csv

- Rows: 4177 | Cols: 2
- Kolom tanggal terdeteksi: `date`
- Date range: 2015-03-08 00:00:00 -> 2026-08-13 00:00:00

### 1. Missing Values
Tidak ada missing values.

### 2. Gap Tanggal
Tidak ada gap, sequence tanggal lengkap.

### 3. Konsistensi Format Tanggal
Semua baris punya format tanggal yang konsisten dan bisa di-parse.

### 4. Outlier (IQR Method)
Tidak ada outlier signifikan terdeteksi (IQR method).

---

## Catatan Metode Penanganan (untuk didiskusikan/dikonfirmasi ke lead)

- **Missing values**: kolom macro (dxy, gold, m2, usdt) di-forward-fill (nilai terakhir dianggap masih berlaku). Fear & Greed index TIDAK di-fill untuk periode sebelum data tersedia (~2018) — dibiarkan NaN karena genuinely tidak ada datanya.
- **Gap tanggal**: kalau ditemukan gap, perlu dicek apakah itu hari libur bursa (wajar) atau benar-benar data hilang (perlu re-fetch). Technical indicator (EMA/RSI/dll) yang NaN di baris-baris awal itu WAJAR karena window warmup, bukan gap.
- **Outlier**: outlier di data harga BTC/DXY/Gold BISA JADI valid (misal saat crash market beneran), BUKAN otomatis dianggap error. Perlu cross-check manual ke tanggal kejadian sebelum diputuskan di-drop/di-cap/dibiarkan.
- **Format tanggal**: kalau ada yang tidak konsisten, standardisasi semua ke format ISO `YYYY-MM-DD` sebelum merge.