# IRIS BTC Terminal — Panduan Fitur per Tab

Dokumen ini menjelaskan **setiap tab dan setiap panel** di dashboard: isinya apa, angkanya
datang dari mana, rumusnya apa, dan cara membacanya. Semua rumus diambil langsung dari kode
(`src/lib/features/<fitur>/live.ts` dan komponen di `src/components/features/`), bukan dari
asumsi. Contoh angka diambil dari dashboard lokal pada **16 Oktober 2026**; struktur tab
diperbarui setelah kurasi **18 Oktober 2026**.

---

## 0. Cara kerja umum (berlaku untuk semua panel)

### Alur data

```
API publik / Supabase ──▶ live.ts (ambil + hitung) ──▶ defineFeature ──▶ panel
                                                          │
                                   gagal / kosong ───────▶ mock.ts + badge MOCK
```

- **Setiap panel** menerima "amplop" data (`Envelope`) yang tahu apakah datanya asli atau
  placeholder. **Sejak 18 Okt, panel yang datanya placeholder disembunyikan** dan diganti satu
  baris "data belum tersedia" beserta alasannya — tidak ada angka contoh di layar.
- Baris **`SOURCE: XXX · 6h ago`** di bawah panel = nama sumber + umur data, dihitung dari
  **timestamp data itu sendiri** (waktu candle, ticker, sesi ETF, transfer terbaru…), bukan waktu
  halaman dibuat. Badge merah **STALE · umur** = data asli tapi lebih tua dari batas panelnya
  (`src/lib/maxAge.ts`).
- **FEEDS n/N** di sidebar kiri = berapa sumber yang hidup dari total yang aktif. `SYNC DIRECT*`
  = sumber diambil langsung saat render (belum ada job ingestion yang melapor).

### Seberapa sering data diperbarui

Setiap halaman **refresh otomatis tiap 30 detik** selama tab terbuka (tanpa reload; berhenti
saat tab disembunyikan). Data tiap sumber di-cache sesuai jendelanya:

| Lapisan | Masa cache |
|---|---|
| Halaman (page `revalidate`) | 30 detik (Distribution 15 menit, ETF 30 menit) |
| Harga spot Coinbase | 30 detik |
| Candle Coinbase/Kraken, stats 24h | 60 detik |
| Long/short Binance | 5–15 menit |
| CoinGecko | 3–60 menit |
| Fear & Greed, FRED, Yahoo, ETF | 1 jam |

Yang **memakai scheduler** hanya worker Python (model mingguan, Santiment, refresh data) dan
whale ingest — lihat `worker/README.md`.

**Anti data basi (18 Okt).** Saat sumber tidak terjangkau, Next.js dulu terus menyajikan respons
cache terakhir — harga dan Flow Radar sempat 2–3 hari tertinggal tanpa tanda. Sekarang setiap
respons diperiksa umurnya lewat header `date`; lebih tua dari 4× jendela cache (min. 5 menit) →
diambil ulang langsung, dan kalau tetap gagal sumber cadangan dipakai (mis. Coinbase → Kraken →
Yahoo) atau panelnya disembunyikan. Penyebab di jaringan uji: DNS Indosat memblokir Coinbase,
Kraken, Binance, Bybit, OKX, Blockstream dan mempool.space — dibuka dengan DNS 1.1.1.1 / 1.0.0.1
(IPv4) dan 2606:4700:4700::1111 / ::1001 (IPv6).

### Timeframe (tombol 1D / 7D / 1M / 3M / 1Y / ALL)

Dipakai di Overview. Menentukan **interval candle** dan **jumlah candle**:

| Tombol | Interval | Jumlah candle |
|---|---|---|
| 1D | 15 menit | 96 |
| 7D | 1 jam | 168 |
| 1M | 4 jam | 180 |
| 3M | 6 jam | 300 |
| 1Y | 1 hari | 365 |
| ALL | 1 minggu | 260 |

### Rantai sumber harga BTC

Hampir semua panel harga memakai: **Coinbase → Kraken → Yahoo BTC-USD**. Kalau Coinbase gagal,
pakai Kraken; kalau Kraken juga gagal, pakai Yahoo. Sumber yang dipakai tidak mengubah rumus.

---

## 1. OVERVIEW — `/overview`

Ringkasan satu layar: sinyal, bukti, dan prakiraan.

### 1.1 WEEKLY FORECAST — contoh: **↑ BULLISH · Confidence 52.6%**

Dulu dua kartu (MARKET REGIME dan WEEKLY OUTLOOK) yang membaca output model yang sama dan
menampilkan label yang sama. Sejak 17 Okt digabung jadi **satu kartu**:

| Baris | Contoh | Asal |
|---|---|---|
| Label | ↑ BULLISH | aturan ambang di bawah |
| Confidence | 52.6% · past BULL calls right (n=266, base 47.9%) | **rekam jejak** sinyal yang sama di data uji notebook (lihat di bawah) |
| Score | P(UP) 20.5% vs threshold 6.0% · close of 2026-10-22 | `p_up` mentah model; tanggal target = `DATA AS OF` + 7 hari (close harian UTC) |
| Likely range | $77,936 – $86,362 | pita volatilitas ±1σ (lihat 1.3) |
| Catatan rentang | held ~70% of weeks since 2018 (63–76% by year) | backtest `worker/scripts/backtest_vol_band.py` |

**Asal label:** model klasifikasi mingguan (XGBoost, notebook kamu) yang dijalankan worker
Python setiap **Senin 07:30 WIB**, lalu disimpan di Supabase `clf_signals` (atau
`worker/out/clf_signal_latest.json` saat lokal).

1. Worker membangun ±150 fitur dari candle harian **tertutup terakhir yang sudah tersedia**:
   - domain **Universal** (teknikal BTC + on-chain + makro + sentimen, 127 kolom)
   - domain **MacroCrossAsset** (FRED, DXY, emas, M2, S&P, Dow, minyak, ETH, 24 kolom)
2. Tiap domain punya model XGBoost sendiri → probabilitas naik per domain.
3. `p_up` = **rata-rata** kedua probabilitas.
4. **Ambang dari notebook** (export 16 Okt, model `created_utc 2026-10-16T19:15`):
   `avg_threshold = 0.06`, hasil brute-force di validation. Satu ambang, dua sinyal:
   - `p_up ≥ 0.06` → **BULL** → ditampilkan **BULLISH**
   - `p_up < 0.06` → **BEAR** → ditampilkan **BEARISH**
   Ambang dibaca langsung dari `meta.json` export (`iris_clf/signal_rule.py`); tidak ada angka
   ambang yang ditulis tangan di repo. Kalau notebook nanti mengekspor `signal_rule.json` dua
   ambang, file itu otomatis dipakai.

**Contoh 17 Okt:** Universal 5.8%, MacroCrossAsset 35.2% → `p_up = (5.8 + 35.2)/2 = 20.5%` ≥ 6% → **BULLISH**.

**Kenapa "confidence" bukan `p_up`?** `p_up` tidak terkalibrasi: model ini bilang BULL dengan
`p_up` 20.5%, jadi menulis "confidence 20.5%" menyesatkan. Confidence = **seberapa sering sinyal
yang sama benar di data uji notebook** (`parity_check.csv`, 30 Jan 2025 – 9 Agu 2026), dihitung
`python -m iris_worker.track_record` → `models/clf_7d/track_record.json`:

| Sinyal | Muncul | Benar | Tanpa model (base rate) |
|---|---|---|---|
| BULL | 266 hari (80%) | **52.6%** | 47.9% |
| BEAR | 66 hari (20%) | **71.2%** | 52.1% |
| Total | 332 | 56.3% (= akurasi test di `meta.json`) | |

Catatan jujur: hanya hari yang diikuti gerakan 7 hari berarti (> 0.5 × vol mingguan) yang punya
label; jendela 7 harinya tumpang tindih, jadi jumlah minggu independen lebih kecil dari n. Jarak
`p_up` ke ambang (`conviction_gate_margin`) **tidak** dipakai sebagai keyakinan karena di data uji
margin besar tidak lebih akurat (top-20% margin: 50% benar; di bawah gate-40: 58.8%).

**Candle belum final:** tepat setelah 00:00 UTC Yahoo sering mengirim candle kemarin dengan close
kosong. Worker memakai candle tertutup terakhir yang ada, mencoba ulang tiap jam (maks. 12×), dan
job mingguan **tidak menerbitkan** sinyal sebelum candle Minggu tersedia.

> Kalau worker belum pernah jalan, label ini jatuh ke **aturan heuristik** (RSI, MACD, EMA21 vs
> EMA50, Fear & Greed) dan detailnya berbunyi "heuristic strength · not a probability".

### 1.2 CONFLUENCE — contoh: **47.0/100**

**Asal angka:** skor gabungan internal dari **5 lapisan bukti**, masing-masing 0–100 (50 = netral),
dengan **bobot tetap yang dipilih manual** (tidak di-fit ke data):

| Lapisan | Bobot | Cara hitung |
|---|---|---|
| TECHNICAL | 0.34 | Rata-rata 4 sub-skor dari candle harian (300 hari): RSI(14) apa adanya; MACD hist `50 + clamp((macd−signal)/harga × 2000) × 50`; jarak EMA21−EMA50 (gap 5% = mentok); jarak harga ke tengah Bollinger(20) (5% = mentok) |
| SENTIMENT | 0.20 | `0.5 × Fear&Greed + 0.5 × NEWS` |
| NEWS | 0.20 | Judul RSS (hingga 20 per feed × 8 feed) dinilai kata kunci: `50 + (positif − negatif)/total × 50` |
| MACRO | 0.20 | Dari Yahoo: DXY (z-score 1 tahun, dibalik — dolar kuat = negatif), VIX (15→+1, 20→+0.5, 25→0, 35→−0.5, 45→−1), S&P 500 30 hari (+10% = mentok). Rata-rata sinyal → skala 0–100 |
| ONCHAIN | 0.06 | **Selalu 50** (belum disambungkan). Bobotnya sengaja kecil |

`overall = 0.34·TECH + 0.20·SENT + 0.20·NEWS + 0.20·MACRO + 0.06·ONCHAIN`

**Contoh (16 Okt, sebelum tab Research dihapus):** TECH 40.1, SENT 54.6, NEWS 46.2, MACRO 50, ONCHAIN 50
→ `0.34×40.1 + 0.2×54.6 + 0.2×46.2 + 0.2×50 + 0.06×50 = 46.8` ✓.
SENTIMENT dicek: `0.5×63 (F&G) + 0.5×46.2 = 54.6` ✓.
MACRO ≈ 50 di sini **bukan karena gagal**, tapi karena sinyalnya saling meniadakan: DXY z = +1.80
→ −0.90 (dolar kuat), VIX 15.9 → +0.91 (pasar tenang), S&P 30 hari −0.3% → −0.03;
rata-rata ≈ −0.007 → `50 + (−0.007 × 50) ≈ 49.6–50`.

**Bull index / Bear index** = `overall` dan `100 − overall`. Hanya cerminan, **bukan peluang**.
Warna: ≥ 60 hijau, 40–60 netral, < 40 merah.

### 1.3 Rentang harga di kartu WEEKLY FORECAST

- **Pita volatilitas ±1σ, bukan target harga**: `σ = harga_terakhir × vol_realisasi_30h × √(7/365)`,
  rentang = harga ± σ. Tidak ada kemiringan arah — model tidak memprediksi besarnya gerakan.
- **Bukti**: dengan rumus yang sama persis, close 7 hari kemudian berada di dalam rentang pada
  **70.2%** hari sejak Maret 2018 (3.142 hari; per tahun 63.1–75.6%). Ulangi kapan saja:
  `cd worker && .venv/Scripts/python scripts/backtest_vol_band.py`.
- Di mode heuristik (worker belum jalan) rentangnya ikut digeser skor, jadi angka 70% **tidak**
  berlaku dan tidak ditampilkan.

### 1.3b SOCIAL SENTIMENT (kartu ketiga)

Donut kecil + persentase positif/netral/negatif hari terbaru dari Santiment. Detail di 5.2.

### 1.4 FEAR & GREED — contoh: **63 GREED, +18.9% 24h**

- Sumber: **alternative.me** (indeks 0–100 milik mereka, gabungan volatilitas, volume, sosial,
  dominasi, trends).
- `+18.9%` = perubahan dibanding hari sebelumnya: `(63 − 53)/53`.
- Zona di bar: 0–25 Extreme Fear, 25–45 Fear, 45–55 Neutral, 55–75 Greed, 75–100 Extreme Greed.

### 1.5 PRICE ACTION (grafik candle)

- Candle BTC/USD sesuai tombol timeframe. OPEN/HIGH/LOW/CLOSE/VOLUME = candle terakhir.
- Tanggal awal/akhir tertulis di bawah grafik; arahkan kursor untuk tanggal + OHLC tiap candle.
- Volume dalam **BTC** saat dari Coinbase/Kraken, dalam **USD** saat jatuh ke Yahoo.

### 1.6 LIVE INTELLIGENCE

- **HEADLINE MIX** (POSITIF / NETRAL / NEGATIF %): dari **40 judul terbaru** (8 feed RSS + post
  Watcher Guru), berapa persen yang diberi label positif/netral/negatif oleh model. Murni hitungan.
  (Dulu ada "Sentiment Score" = `0.6 × berita + 0.4 × F&G`; bobotnya karangan, **dihapus 16 Okt**.)
- **Penilaian judul** = model sentimen riset Azan (`services/sentiment-node`): Financial
  DistilRoBERTa (ONNX) + parser V3, dengan pembanding TF-IDF. Label = **nada teks**
  positif/netral/negatif, **bukan ramalan harga BTC** — karena itu tertulis POSITIF/NEGATIF, bukan
  BULLISH/BEARISH (18 Okt). Tiap judul menampilkan engine, label TF-IDF, dan tanda REVIEW (model
  masih tahap riset). Kalau worker model mati, judul dinilai kamus kata
  (`src/lib/sources/lexicon.ts`) dan tertulis **"Heuristic · model unavailable"**.
- **Daftar berita**: judul terbaru dari 8 feed (CoinTelegraph, Decrypt, NewsBTC, CoinDesk, The Block,
  Bitcoin Magazine, Blockworks, BeInCrypto) **plus Watcher Guru**, **diurutkan dari yang terbaru**.
  Tiap judul diberi kategori kata kunci (lihat 5.2) dan label model.
  (Dulu ada label HIGH/MEDIUM/LOW IMPACT dari skor yang angkanya dipilih manual — **dihapus 16 Okt**.)
- **Watcher Guru** tidak punya API/RSS yang memadai. Postnya diambil dari pratinjau publik Telegram
  `t.me/s/WatcherGuru` oleh pipeline riset (`news_pipeline/`, dari christoverhendri/bitcoin-iris
  branch azan-sentiment) → SQLite `worker/data/news/` → snapshot `.data/watcher-guru.json`. Job
  worker `watcher_news` menjalankannya tiap menit. Kalau pengambilan terakhir > 10 menit lalu
  (worker mati), post Watcher Guru tidak ditampilkan. Isinya tidak hanya kripto (juga pasar umum,
  teknologi).

### 1.7 BTC SNAPSHOT

| Baris | Asal |
|---|---|
| LAST | Harga spot Coinbase (fallback: Yahoo) |
| 24H CHG / HIGH / LOW | Coinbase `/stats` 24 jam bergulir (fallback: 24 bar 1 jam Yahoo) |
| 7D / 30D | CoinGecko % perubahan (fallback: dihitung dari close harian) |
| VOL 24H, MCAP | CoinGecko |
| DOMINANCE | CoinGecko — porsi kapitalisasi BTC dari total kripto |
| REALIZED VOL | Std. dev. log-return harian 30 hari × √365 × 100 |

### 1.8 TECHNICALS (kolom kanan bawah)

Dihitung dari candle sesuai timeframe (minimal 180 candle):

| Baris | Rumus |
|---|---|
| RSI (14) | RSI Wilder; > 70 = OB (overbought), < 30 = OS (oversold) |
| MACD / MACD SIGNAL | EMA12 − EMA26; signal = EMA9 dari MACD |
| EMA5 / EMA21 GAP | `(EMA5 − EMA21)/EMA21` |
| BOLLINGER %B | ⚠️ lihat [Masalah yang ditemukan](#9-masalah-yang-ditemukan) — saat ini selalu 50.0 |
| ATR (VOL %) | ⚠️ sebenarnya **lebar Bollinger** `(atas − bawah)/tengah`, bukan ATR |
| EMA21 | EMA 21 periode |

---

## 2. MARKET — dihapus 18 Okt

Tab Market (Price, Technicals) dihapus saat kurasi; grafik harga dan technicals tetap ada di
Overview. Link lama `/market/...` diarahkan ke `/overview`.

---

## 3. QUANTITATIVE — `/quant/seasonality`

Sub-tab Volatility dihapus (link lama diarahkan ke Seasonality).

### 3.1 MONTHLY RETURN HEATMAP

- **Sumber:** bar bulanan Yahoo BTC-USD sejak awal datanya (bulan penuh pertama **Okt 2014**,
  ±12 tahun).
- **Isi kotak:** `(close bulan − open bulan) ÷ open × 100`. Hijau = naik, merah = turun. Bulan
  yang masih berjalan ditandai `*` dan tidak dihitung di rata-rata maupun peluang.
- **AVG:** rata-rata return bulan itu di semua tahun yang sudah selesai.
- **PELUANG NAIK:** `jumlah tahun bulan itu ditutup naik ÷ jumlah tahun` — mis. `9/12 = 75%`.
  Murni hitungan sejarah, tanpa model. Tiap bulan hanya punya ±11–12 contoh, jadi ini catatan,
  bukan jaminan. 50% tepat ditampilkan abu-abu (sama dengan lempar koin).

---

## 4. ON-CHAIN

Tiga sub-tab (URL baru, supaya tidak bentrok dengan redirect lama yang tersimpan di browser):

### 4.1 ETF FLOWS — `/chain/etf`

Sumber: tabel **bitbo.io** (di-scrape, bentuk tabel divalidasi). Data settle T+1.

| Panel | Isi |
|---|---|
| KPI | Sesi terakhir, net 10 sesi (rata-rata per sesi), sesi terbesar |
| ETF NET FLOW PER SESI | Kartu kecil: bar net per sesi dengan **tanggal di bawah tiap bar**; arahkan kursor untuk tanggal + nilai |
| FLOW MATRIX | Tabel sesi × ETF (US$ juta). Kolom NET dihapus karena sama dengan bar di atas |

Dihapus: STREAK, IBIT SHARE, BY ISSUER.

### 4.2 LONG / SHORT — `/chain/long-short`

Sumber: **Binance Futures** BTCUSDT, per jam, 48 jam.

| Panel | Isi |
|---|---|
| KPI | Rasio long/short **retail** (per akun) dan **top trader** (per ukuran posisi akun besar) |
| LONG / SHORT | Dua garis 48 jam; garis 1.00 = seimbang. Hover: jam, rasio retail, rasio top trader |
| TAKER FLOW | Volume beli agresif − jual agresif per jam (dalam **BTC**). Hover: jam, beli, jual, net |

Dihapus: DIVERGENCE, BIAS · OPINION, COINBASE PREMIUM.

### 4.3 WALLET & TRANSFER — `/chain/wallets`

Sumber: **15 alamat bursa yang dilacak** via Blockstream Esplora (sampel, bukan seluruh dompet bursa).

| Panel | Isi |
|---|---|
| EXCHANGE RESERVE | Total saldo + satu bar cold/hot dengan jumlah BTC dan persentasenya (hot sudah termasuk alamat deposit) |
| EXCHANGE NETFLOW | Net posisi (besar) + bar inflow/outflow dari transfer terbaru yang terlihat |
| FLOW RADAR | Transfer ≥ 50 BTC, terbaru di atas, dengan jenis (inflow/outflow/hot↔cold) |

- **PENDING** = transaksi yang sudah disiarkan tapi belum masuk blok. Kalau sumbernya basi,
  baris PENDING bisa "membeku" — itulah yang terjadi sebelum 18 Okt (cache 3 hari).
- `SOURCE · 47h ago` di sini = umur **transfer besar terbaru**, bukan umur pengambilan data:
  transfer ≥ 50 BTC di 15 alamat ini memang tidak terjadi tiap jam.

Dihapus/dipindah: halaman Supply (cold/hot-nya dobel dengan Exchange Reserve), Network,
Derivatives, kartu DEPOSIT, tabel FLOW SUMMARY (dobel dengan Exchange Netflow).

---

## 5. SENTIMENT — `/sentiment`

### 5.1 Strip ringkasan

| Sel | Asal |
|---|---|
| FEAR & GREED | alternative.me (lihat 1.4) |
| SENTIMENT MIX | Porsi judul positif/netral/negatif dari model (lihat 1.6) |
| NEWS TONE | LEBIH BANYAK POSITIF / LEBIH BANYAK NEGATIF / SEIMBANG dari daftar berita |
| WORLD EVENTS | Jumlah event di peta + berapa yang terbit dalam 24 jam |

Sel WHALE FLOW 24H dihapus — sama dengan ringkasan 24 jam di atas Whale Wire.

### 5.2 SOCIAL SENTIMENT · BTC (Santiment)

Donut proporsi postingan positif / netral / negatif hari terbaru (bar chart 30 hari dihapus 18 Okt).
Akun gratis Santiment menahan 30 hari terakhir, jadi datanya ±30 hari lalu — tertulis di panel.

### 5.3 GLOBAL EVENT MAP dan 5.4 WHALE WIRE

Peta event: lihat penjelasan kategori di bawah. Label positif/netral/negatif tiap event juga dari
model yang sama (lihat 1.6), satu panggilan per halaman. Transfer on-chain hanya ditambahkan ke peta kalau
datanya asli. **Whale Wire** butuh Supabase + `WHALE_ALERT_API_KEY`; sampai itu ada, panelnya
disembunyikan (tidak ada data contoh).

**Aturan kategori** (`src/lib/geo/classify.ts`): judul dicocokkan ke daftar kata dari atas ke
bawah; kategori pertama yang cocok dipakai, kalau tidak ada → MARKET. REGULATION (sec,
regulation, mica, ban, …), ETF_FUND (etf, blackrock, inflow, …), SECURITY (hack, exploit, …),
MONETARY (fed, fomc, cpi, inflation, …), GEOPOLITICS (sanction, war, election, tariff, …),
ADOPTION, LEGAL.

---

## 6. MACRO

Hanya **Amerika Serikat** (negara lain dihapus); tidak ada lagi baris pilihan negara. Tidak ada
angka sigma/z di layar — posisi ditulis dengan kata ("di atas / sekitar / di bawah biasanya").

### 6.1 DATA — `/macro/data`

Satu tabel: METRIC · ARTINYA · NILAI · DIBANDING BIASANYA (vs 2 tahun terakhir).

| Metrik | Seri FRED |
|---|---|
| CPI INDEX | CPIAUCSL (level indeks — karena terus naik, hampir selalu "di atas") |
| POLICY RATE | FEDFUNDS (rata-rata bulanan) |
| GDP GROWTH | A191RL1Q225SBEA (kuartalan, disetahunkan) |
| INFLATION | CPILFESL `units=pc1` (inti, % per tahun) |

Jendela pembanding = 2 tahun untuk tiap frekuensi (24 data bulanan, 8 data kuartalan).
Penjaga kesegaran: bulanan 120 hari, kuartalan **270 hari** (dulu 200 — kedaluwarsa 18 Okt
sebelum GDP Q3 rilis, sehingga panel sempat MOCK).

### 6.2 REGIME — `/macro/regime`

Fase ekonomi dari pertumbuhan × inflasi inti, masing-masing dibanding 2 tahun terakhir. Kalau
keduanya masih dekat kebiasaannya (dalam ±1 simpangan baku), labelnya **NORMAL** dengan catatan
condong ke kuadran mana. "DEFLATION" berarti keduanya di bawah biasanya, **bukan** harga turun.
COMPOSITE IMPULSE dihapus.

### 6.3 MARKETS — `/macro/markets`

| Panel | Isi |
|---|---|
| GLOBAL MARKETS | Level, "vs setahun terakhir" (kata), perubahan 1/5/30 sesi, grafik setahun (hover: tanggal + nilai). 1D = vs close sesi sebelumnya (diperbaiki — dulu ±1 tahun) |
| KORELASI 30 HARI DENGAN BTC | Satu grafik garis per pasar (DXY, S&P 500, VIX, emas, US 10Y): korelasi 30 hari bergulir selama setahun, skala −1..+1. Area abu-abu = `|r| < 1.96/√30 ≈ 0.36`, terlalu lemah disebut hubungan. Hover: tanggal + nilai |

Kolom CORR dan Z 1Y serta strip z-score dihapus. Tanggal BTC dari CoinGecko dikoreksi 18 Okt
(sebelumnya bergeser satu hari, sehingga semua korelasi terbaca ±0).

---

## 7. FORECAST

### 7.1 WEEKLY FORECAST — `/forecast/weekly` (tab pertama)

| Panel | Isi |
|---|---|
| WEEKLY REGIME FORECAST | Label model, tanggal close yang diprediksi, skor P(naik 7 hari) vs ambang `avg_threshold` 0.06, dan **peluang sinyal ini benar** (track record di data uji) dibanding tebakan dasar |
| DRIVER BREAKDOWN | Kontribusi tiap domain: `(p_domain − ambang)/n`; skor = `p_up − ambang` |
| FORWARD RETURN RANGE | Pita volatilitas 1σ 7 hari, **bukan prediksi arah** (dulu tertulis dua kali) |

Skor P(naik) bukan peluang — belum dikalibrasi; peluangnya adalah track record.

### 7.2 DISTRIBUTION — `/forecast/distribution`

- Di atas: kartu **PRAKIRAAN MINGGUAN** (label + peluang sinyal benar) supaya prakiraan mingguan
  terlihat tanpa pindah tab.
- **PRICE DISTRIBUTION:** harga aktual + kerucut simulasi (4.000 jalur, FHS + GARCH). Pita gelap =
  50% hasil, pita terang = 90%. Hover: tanggal + harga (aktual) atau tengah/kisaran (simulasi).
- **KISARAN HARGA PER JANGKA WAKTU:** kolom dengan bahasa sederhana — SANGAT RENDAH (P5), RENDAH
  (P25), TENGAH (P50), TINGGI (P75), SANGAT TINGGI (P95), GERAK UMUM, LEBAR 90%.

Dihapus: tab Calibration, OUTCOME DENSITY, PROBABILITY ABOVE, MODEL STATE, kolom WINDOWS, dan
kotak harga di bawah fan chart (sama dengan baris tabel).

---

## 8. RESEARCH (dihapus)

Tab Research dihapus pada 16 Okt 2026 karena isinya hanya mengulang kartu Confluence di
Overview (lihat 1.2). Link lama `/research/...` diarahkan ke `/overview`.

---

## 9. Masalah yang ditemukan

Ditemukan saat menelusuri kode dan dicek di dashboard. **Belum diperbaiki.**

| # | Lokasi | Masalah | Dampak |
|---|---|---|---|
| 1 | `components/features/overview/TechReadout.tsx` | **BOLLINGER %B** memakai garis tengah, bukan harga: `(tengah − bawah)/(atas − bawah)` = selalu 0.5 | Selalu tampil **50.0** apa pun harganya |
| 2 | File yang sama | **ATR (VOL %)** sebenarnya `(atas − bawah)/tengah` = lebar Bollinger | Label salah; ATR asli tidak dihitung |
| 3 | ~~`signal_rule.json` (model mingguan)~~ | ~~Ambang 0.23/0.70 karangan~~ — **selesai 17 Okt**: dihapus, ambang kini `avg_threshold` 0.06 dari export notebook | — |
| 4 | Label berita (kategori, bullish/bearish) | Aturan kata kunci dipertahankan (rule-based), tapi pencocokannya per potongan huruf: "Hard**war**e" dan "Fed's **War**sh" → GEOPOLITICS, "P**red**ict" → bearish, "Central **ban**k" → bearish + REGULATION. Label bull/bear nanti diganti model researcher | Label bisa salah sampai pencocokan diubah ke per kata utuh |
| 5 | ONCHAIN confluence | Konstanta 50, belum disambungkan ke data on-chain | 6% skor tidak bergerak |
| 6 | ~~`StatusFooter.tsx`~~ | ~~Hydration mismatch "2s ago"~~ — **selesai 18 Okt**: SYNC menampilkan `DIRECT*`, umur diformat terhadap waktu render server | — |
| 7 | Data training notebook (FRED) | **Lookahead**: GDP ditempatkan di awal kuartal + 30 hari (GDP Q2 sudah ada 1 Mei, rilis ~30 Jul), M2 di tanggal observasi (~7 minggu sebelum rilis). Diverifikasi 17 Okt dari tanggal perubahan nilai di `btc_master_2.csv` | Model dilatih dengan GDP/M2 satu periode lebih baru dari yang tersedia saat itu → metrik test bisa sedikit terlalu optimis; live tidak bisa meniru. Perbaiki di notebook dengan lag rilis |

## 10. Key yang membuka panel MOCK

| Key | Membuka |
|---|---|
| `FRED_API_KEY` ✅ aktif 17 Okt | Macro Data & Regime (US), + 12 kolom makro model mingguan |
| `WHALE_ALERT_API_KEY` + `CRON_SECRET` + Supabase | Whale Wire (disembunyikan sampai tersedia) |
| `COINGECKO_API_KEY` (opsional) | Batas request CoinGecko lebih longgar |
| `SANTIMENT_API_KEY` (di `worker/.env`) | Social Sentiment (Overview + Sentiment); data tertunda 30 hari di akun gratis |
| Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | Menyimpan sinyal model & whale events di database, bukan file lokal |
