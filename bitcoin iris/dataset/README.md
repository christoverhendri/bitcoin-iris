# README — BTC Master Dataset

Dokumentasi ini menjelaskan tiap file dataset: isinya apa, dari mana, metode pengisian missing value-nya gimana, periode waktunya berapa, dan kenapa periode/metode itu yang dipilih. Tujuannya biar siapapun di tim yang pakai dataset ini nggak perlu nanya-nanya lagi soal asal-usul datanya.

---

## Konsep Dasar yang Perlu Dipahami Dulu

### 1. Kenapa mulai dari 8 Maret 2015, bukan 1 Januari 2015?
Semua sumber data yang kita pakai punya histori dari 2015, **kecuali USDT Dominance** yang baru mulai tersedia **8 Maret 2015**. Daripada maksa isi Januari-Februari 2015 dengan data yang secara harfiah nggak pernah ada, kita drop total periode itu. Jadi `MASTER_START = 2015-03-08` berlaku sebagai tanggal mulai universal buat semua kategori (kecuali Fear&Greed dan Sentiment yang emang punya periode sendiri, dijelaskan di bawah).

### 2. Metode fill yang dipakai: Forward-Fill (ffill), dengan Backward-Fill (bfill) sebagai penutup
Prinsip umum di semua file: **forward-fill** — nilai yang hilang di suatu tanggal diisi pakai nilai terakhir yang diketahui sebelumnya. Ini masuk akal secara ekonomi/finansial: kalau CPI bulan Januari nilainya 300, maka nilai itu "berlaku" sampai ada rilis CPI baru bulan berikutnya — bukan tiba-tiba jadi nol atau interpolasi linear yang seakan-akan kita tau nilai masa depan.

`bfill` cuma dipakai sebagai **penutup di baris paling awal** kalau ffill nggak bisa jalan (karena belum ada nilai sebelumnya buat di-forward). Ini penting dibedakan dari ffill: bfill "nyuri" nilai dari masa depan, jadi cuma dipakai di edge case yang emang nggak bisa dihindari (dijelaskan per kategori di bawah).

### 3. Kenapa FRED (CPI, NFP, dll) di-"geser" tanggalnya sebelum di-ffill?
Ini bagian paling penting buat dipahami. Data FRED disimpan dengan **tanggal periode** (misal `2015-01-01` = "data bulan Januari"), padahal di dunia nyata, **angka itu baru dipublikasikan sekitar 1-2 bulan setelahnya**. CPI Januari misalnya baru dirilis ke publik pertengahan Februari.

Kalau kita langsung ffill dari tanggal periode, artinya dataset bakal bilang "CPI Januari udah diketahui dari tanggal 1 Januari" — padahal publik baru tau itu 6 minggu kemudian. Ini disebut **lookahead bias / data leakage**: kalau dipakai buat training model prediksi, model jadi "curang" karena dikasih informasi yang belum tersedia di waktu itu.

**Solusinya**: setiap series FRED digeser maju (`shift`) sejumlah hari sesuai estimasi jadwal rilis riil, baru di-ffill. Contoh: data periode `2015-01-01` dengan lag 45 hari, jadi "baru muncul" di dataset sekitar `2015-02-15` — bukan `2015-01-01`.

⚠️ **Catatan jujur**: angka lag ini adalah **estimasi umum** (rata-rata jadwal rilis historis BLS/BEA), bukan tanggal rilis exact per bulan (yang bisa geser beberapa hari tergantung kalender). Kalau butuh presisi penuh (misal buat paper yang bakal direview ketat), pertimbangkan pull tanggal rilis asli per observasi dari **ALFRED** (Archival FRED, `alfredapi`), bukan pakai lag konstan seperti di sini.

---

## Dataset per Kategori

### `technical.csv`
**Isi:** OHLCV harga BTC + semua indikator teknikal turunan + fitur halving.

| Kolom | Penjelasan |
|---|---|
| `btc_open/high/low/close/volume` | Harga & volume harian BTC/USD |
| `ema_5/8/13/21` | Exponential Moving Average, window 5/8/13/21 hari |
| `rsi_14` | Relative Strength Index, window 14 hari |
| `macd`, `macd_signal`, `macd_hist` | Moving Average Convergence Divergence |
| `bb_mid/upper/lower/width` | Bollinger Bands (window 20, 2 std dev) |
| `atr_14` | Average True Range, window 14 hari |
| `log_return` | Log return harian |
| `realized_vol_14` | Realized volatility (annualized), window 14 hari |
| `days_since_last_halving` | Jumlah hari sejak halving terakhir |
| `days_until_next_halving` | Jumlah hari sampai halving berikutnya |
| `halving_cycle_phase` | Posisi dalam siklus halving (0-1) |
| `halving_phase_sin/cos` | Cyclical encoding dari fase halving |
| `next_halving_is_projected` | `True` kalau tanggal halving berikutnya masih **proyeksi** (bukan tanggal resmi) |

**Sumber:** yfinance (harga), dihitung sendiri (indikator teknikal).
**Metode fill:** Data harian native (BTC trading 24/7), praktis nggak ada gap — cuma `days_until_next_halving` yang perlu treatment khusus.
**Periode:** 2015-03-08 → sekarang.
**Kenapa ada `next_halving_is_projected`?** Bitcoin baru punya 4 kali halving (2012, 2016, 2020, April 2024). Setelah halving ke-4, kita nggak tau pasti tanggal halving ke-5 (baru bisa diestimasi dari rata-rata siklus ~1458 hari). Kolom `days_until_next_halving` di periode ini diisi pakai **proyeksi**, dan flag ini kasih tau kamu kolom mana yang "pasti" vs "estimasi" — supaya nggak salah interpretasi sebagai fakta historis.

---

### `onchain.csv`
**Isi:** 19 metric on-chain Bitcoin (hash rate, mining difficulty, transaction fees, active addresses, MVRV, SOPR, dll).

**Sumber:** Blockchain.com Charts API (mayoritas) + Coin Metrics Community API (MVRV, SOPR).
**Metode fill:** Forward-fill. Beberapa kolom (`avg_confirmation_time_min` khususnya) punya gap tersebar (~414 hari dari total 4186) karena keterbatasan API di beberapa periode — di-ffill dengan asumsi kondisi network nggak berubah drastis di hari-hari kosong tersebut.
**Periode:** 2015-03-08 → sekarang.
**Kenapa ffill dianggap wajar di sini?** Metric on-chain (hash rate, difficulty, dll) berubah relatif lambat/gradual hari ke hari — beda sama harga yang bisa lompat drastis. Jadi ffill buat gap beberapa hari nggak terlalu mendistorsi sinyal dibanding kalau kita drop baris tersebut.

---

### `makro.csv`
**Isi:** DXY (Dollar Index), harga Gold, M2 Money Supply, USDT Dominance.

**Sumber:** dari file yang udah kamu kumpulin sebelumnya (`dxy_index_daily_ffilled.csv`, dll).
**Metode fill:** Forward-fill (M2 khususnya, karena rilis bulanan tapi di-ffill ke harian — sama logikanya kayak FRED, tapi M2 di sini nggak di-lag karena udah dalam bentuk "daily_ffilled" dari sumber aslinya).
**Periode:** 2015-03-08 → sekarang.
**Kenapa mulai 8 Maret 2015?** Ini justru penentu `MASTER_START` — USDT Dominance nggak punya data sebelum tanggal ini karena Tether/stablecoin dominance sebagai konsep metric baru mulai tercatat sejak itu.

---

### `fred.csv`
**Isi:** 9 indikator makro AS dari Federal Reserve Economic Data, dengan nama yang udah diganti jadi jelas.

| Kolom (baru) | Kode FRED asli | Lag rilis dipakai | Kenapa lag segitu |
|---|---|---|---|
| `cpi_headline` | CPIAUCSL | 45 hari | CPI rilis pertengahan bulan berikutnya |
| `core_pce` | PCEPILFE | 60 hari | PCE rilis akhir bulan berikutnya (lag terpanjang) |
| `ppi` | PPIACO | 45 hari | Rilis pertengahan bulan berikutnya |
| `nonfarm_payrolls` | PAYEMS | 35 hari | Rilis Jumat pertama bulan berikutnya |
| `unemployment_rate` | UNRATE | 35 hari | Rilis bareng NFP |
| `avg_hourly_earnings` | CES0500000003 | 35 hari | Rilis bareng NFP |
| `retail_sales` | RSAFS | 45 hari | Rilis pertengahan bulan berikutnya |
| `gdp_nominal` | GDP | 30 hari | Advance estimate ~1 bulan setelah akhir kuartal |
| `fomc_rate_upper/lower` | DFEDTARU/DFEDTARL | 0 hari | Fed umumin di hari yang sama (real-time) |
| `fomc_rate_changed` | rate_changed | 0 hari | Sama seperti di atas |

**Sumber:** FRED API (data periode asli), lag-adjustment dilakuin manual di notebook.
**Metode fill:** Shift tanggal (sesuai lag di atas) → forward-fill ke harian → backward-fill cuma buat baris paling awal (~30-60 hari pertama sebelum rilis pertama tersedia).
**Periode:** 2015-03-08 → sekarang.
**Kenapa nama variabelnya diganti?** Kode asli FRED (`CPIAUCSL`, `PAYEMS`, dll) nggak self-explanatory buat orang yang belum familiar sama sistem FRED — nama baru langsung kebaca tanpa perlu buka dokumentasi FRED.

---

### `crossasset.csv`
**Isi:** ETH/USD, S&P 500, Dow Jones, Oil (WTI Crude).

| Kolom | Sumber |
|---|---|
| `eth_close`, `eth_volume_usd` | yfinance (`ETH-USD`) |
| `sp500_close`, `sp500_volume` | TradingView (`TVC:SPX`) |
| `dowjones_close`, `dowjones_volume` | TradingView (`TVC:DJI`) |
| `oil_close`, `oil_volume` | TradingView (`TVC:USOIL`) |
| `eth_price_is_backfilled` | Flag transparansi (lihat di bawah) |

**Metode fill:** Forward-fill (nutup weekend/libur bursa untuk saham & oil) → backward-fill (khusus buat window ETH pre-listing, lihat di bawah).
**Periode:** 2015-03-08 → sekarang.

**⚠️ Kenapa ada kolom `eth_price_is_backfilled`?**
Ethereum di yfinance baru punya data mulai **~November 2017** — jauh setelah `MASTER_START` (Maret 2015). Supaya `btc_master_1.csv` tetap punya nol missing value dari awal periode, kolom ETH di window Maret 2015 - November 2017 di-backfill pakai harga pertama yang tersedia. **Ini BUKAN data asli** — itu cuma placeholder biar nggak ada NaN. Kolom flag ini `True` di window tersebut. **Jangan pakai fitur ETH sebagai sinyal beneran kalau flag ini `True`** — kalau model kamu sensitif ke ini, exclude baris tersebut atau exclude fitur ETH buat periode itu.

---

### `g_trend.csv`
**Isi:** Google Trends search interest untuk keyword "bitcoin".
**Sumber:** Data yang udah kamu kumpulin (`trend.csv`).
**Metode fill:** Nggak perlu fill — datanya udah lengkap harian dari sononya, nol missing value dari awal.
**Periode:** 2015-03-08 → sekarang.
**Kenapa nggak digabung ke master lain sebagai satu file "attention"?** Karena Fear&Greed dan Sentiment punya periode ketersediaan yang beda jauh (2018 dan 2025), gabungin semuanya jadi satu file bakal bikin dua pertiga file itu isinya NaN semua kalau dipaksa ke periode 2015. Jadi masing-masing dibiarin di file terpisah dengan periode aslinya sendiri-sendiri, transparan soal cakupannya.

---

### `feargreed.csv`
**Isi:** Crypto Fear & Greed Index (alternative.me).
**Sumber:** alternative.me API.
**Metode fill:** Forward-fill (ada 4 hari bolong di tengah rentang data aslinya, kemungkinan downtime API).
**Periode:** **2018-02-01 → sekarang** — TIDAK dipaksa mundur ke 2015.
**Kenapa periodenya beda sendiri?** Fear & Greed Index sebagai produk baru diluncurkan Februari 2018 — nggak ada data historis sebelum itu di dunia nyata, jadi maksa mundur ke 2015 cuma bakal jadi NaN kosong 3 tahun. Lebih jujur biarin periode aslinya dan pakai file ini cuma kalau riset kamu emang fokus di rentang 2018 ke atas (`btc_master_2.csv` dan `btc_master_3.csv` udah include ini).

---

### `sentimen.csv`
**Isi:** Social sentiment Bitcoin dari Santiment/Sanbase (positive/negative score, social volume, proporsi).

| Kolom | Penjelasan |
|---|---|
| `sentiment_positive_total` | Sum skor sentiment positif (dokumen dengan skor > 0.7) |
| `sentiment_negative_total` | Sum skor sentiment negatif |
| `sentiment_balance_total` | Net balance (positive - negative) |
| `social_volume_total` | Total mentions Bitcoin di semua sumber sosial |
| `pct_positive`, `pct_negative` | Proporsi berbasis **sum skor** (bukan jumlah dokumen) |
| `sentiment_balance_normalized` | Balance dinormalisasi terhadap volume |

**Sumber:** Santiment GraphQL API.
**Metode fill:** Nggak perlu fill — data harian lengkap dari sononya.
**Periode:** **~2025-08-21 → sekarang** — TIDAK dipaksa mundur.
**Kenapa periodenya cuma segitu?** Ini batasan free tier Santiment (historical depth terbatas beberapa bulan-1 tahun ke belakang tanpa staking token SAN) — bukan pilihan desain kita, tapi limitasi sumber data itu sendiri.

---

## Master Dataset (Gabungan)

| File | Isi | Periode | Kenapa periode segitu |
|---|---|---|---|
| **`btc_master_1.csv`** | technical + makro + g_trend + onchain + fred + crossasset (71 kolom) | 2015-03-08 → sekarang | Cakupan paling panjang — tanpa Fear&Greed/Sentiment karena keduanya belum eksis di sebagian besar rentang ini |
| **`btc_master_2.csv`** | master_1 + feargreed (73 kolom) | 2018-02-01 → sekarang | Dipotong otomatis ke tanggal mulai Fear&Greed — supaya nggak ada baris yang NaN di kolom itu |
| **`btc_master_3.csv`** | master_2 + sentimen (80 kolom) | ~2025-08-21 → sekarang | Dipotong otomatis ke tanggal mulai Sentiment Sanbase — window terpendek karena batasan sumber data ini |

**Semua file di atas dijamin nol missing value** — diverifikasi otomatis pakai `assert df.isna().sum().sum() == 0` di notebook, jadi kalau ada yang lolos dan ternyata ada NaN, notebook bakal error keras (bukan silent fail).

---

## Ringkasan Cepat: Kapan Pakai File yang Mana?

- **Butuh histori paling panjang, nggak butuh sentiment/fear&greed** → `btc_master_1.csv`
- **Butuh Fear&Greed sebagai fitur, oke histori mulai 2018** → `btc_master_2.csv`
- **Butuh sentiment Sanbase, sadar histori cuma ~1 tahun** → `btc_master_3.csv`
- **Cuma butuh 1 kategori spesifik buat analisis terpisah** (misal cuma on-chain aja) → pakai file di folder `kategori/`

## Kolom yang Perlu Diperlakukan Khusus (jangan diabaikan)
- `eth_price_is_backfilled` (di `crossasset.csv` & semua master) — `True` = data ETH placeholder, bukan asli
- `next_halving_is_projected` (di `technical.csv` & semua master) — `True` = tanggal halving berikutnya masih estimasi
- Semua kolom FRED — inget udah di-lag, bukan tanggal periode asli, kalau butuh cross-check ke sumber asli FRED
