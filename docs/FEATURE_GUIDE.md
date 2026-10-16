# IRIS BTC Terminal — Panduan Fitur per Tab

Dokumen ini menjelaskan **setiap tab dan setiap panel** di dashboard: isinya apa, angkanya
datang dari mana, rumusnya apa, dan cara membacanya. Semua rumus diambil langsung dari kode
(`src/lib/features/<fitur>/live.ts` dan komponen di `src/components/features/`), bukan dari
asumsi. Contoh angka diambil dari dashboard lokal pada **16 Oktober 2026**.

---

## 0. Cara kerja umum (berlaku untuk semua panel)

### Alur data

```
API publik / Supabase ──▶ live.ts (ambil + hitung) ──▶ defineFeature ──▶ panel
                                                          │
                                   gagal / kosong ───────▶ mock.ts + badge MOCK
```

- **Setiap panel** menerima "amplop" data (`Envelope`) yang tahu apakah datanya asli atau
  placeholder. Kalau sumber gagal, panel **tidak error** — ia menampilkan data contoh dengan
  badge **MOCK** dan tooltip cara membukanya (mis. "set FRED_API_KEY").
- Baris **`SOURCE: XXX · 6h ago`** di bawah panel = nama sumber + umur data terakhir.
- **FEEDS n/N** di sidebar kiri = berapa sumber yang hidup dari total yang aktif.

### Seberapa sering data diperbarui

Dashboard **tidak memakai scheduler** — data diambil saat halaman dibuka, lalu di-cache:

| Lapisan | Masa cache |
|---|---|
| Halaman (page `revalidate`) | 30 detik (Distribution 15 menit, ETF 30 menit, Calibration 1 jam) |
| Harga spot Coinbase | 30 detik |
| Candle Coinbase/Kraken, stats 24h | 60 detik |
| Derivatives (Bybit/OKX/Binance) | 2–15 menit |
| CoinGecko | 3–60 menit |
| Fear & Greed, FRED, Yahoo, ETF, blockchain.info | 1 jam |

Yang **memakai scheduler** hanya worker Python (model mingguan) dan whale ingest — lihat
`worker/README.md`.

### Timeframe (tombol 1D / 7D / 1M / 3M / 1Y / ALL)

Dipakai di Overview dan Market. Menentukan **interval candle** dan **jumlah candle**:

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

### 1.1 MARKET REGIME — contoh: **NEUTRAL**

**Asal label:** model klasifikasi mingguan (XGBoost, notebook kamu) yang dijalankan worker
Python setiap **Senin 07:30 WIB**, lalu disimpan di Supabase `clf_signals` (atau
`worker/out/clf_signal_latest.json` saat lokal).

1. Worker membangun ±190 fitur dari candle harian yang **sudah tertutup** (kemarin UTC):
   - domain **Universal** (teknikal BTC + on-chain + makro + sentimen, 125 kolom)
   - domain **MacroCrossAsset** (FRED, DXY, emas, M2, S&P, Dow, minyak, ETH, 24 kolom)
2. Tiap domain punya model XGBoost sendiri → probabilitas naik per domain.
3. `p_up` = **rata-rata** kedua probabilitas.
4. Aturan dual threshold (dipilih di validation):
   - `p_up > 0.70` → **BULL** → ditampilkan **BULLISH**
   - `p_up < 0.23` → **BEAR** → ditampilkan **BEARISH**
   - di antaranya → **NONE** → ditampilkan **NEUTRAL** ("no signal")

**Contoh 16 Okt:** Universal 13.6%, MacroCrossAsset 34.4% → `p_up = (13.6 + 34.4)/2 = 24.0%`.
24.0% berada di antara 23% dan 70% → **NEUTRAL**.

**Baris detail** "Model P(UP, 7D), uncalibrated: 24.0%" = `p_up` mentah. *Uncalibrated* artinya
24% **bukan** peluang sungguhan 24% — angka ini hanya bermakna relatif terhadap ambang.

> Kalau worker belum pernah jalan, label ini jatuh ke **aturan heuristik** (RSI, MACD, EMA21 vs
> EMA50, Fear & Greed) dan detailnya berbunyi "heuristic strength · not a probability".

### 1.2 CONFLUENCE — contoh: **47.0/100**

**Asal angka:** skor gabungan internal dari **5 lapisan bukti**, masing-masing 0–100 (50 = netral),
dengan **bobot tetap yang dipilih manual** (tidak di-fit ke data):

| Lapisan | Bobot | Cara hitung |
|---|---|---|
| TECHNICAL | 0.34 | Rata-rata 4 sub-skor dari candle harian (300 hari): RSI(14) apa adanya; MACD hist `50 + clamp((macd−signal)/harga × 2000) × 50`; jarak EMA21−EMA50 (gap 5% = mentok); jarak harga ke tengah Bollinger(20) (5% = mentok) |
| SENTIMENT | 0.20 | `0.5 × Fear&Greed + 0.5 × NEWS` |
| NEWS | 0.20 | 20 judul berita RSS dinilai kata kunci: `50 + (positif − negatif)/total × 50` |
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

### 1.3 WEEKLY OUTLOOK — contoh: **→ NEUTRAL**

- Label & panah sama dengan Market Regime (dari model mingguan).
- **Rentang harga** "$77,936 – $86,362" = **pita volatilitas 1σ, bukan target harga**:
  `σ = harga_terakhir × vol_realisasi_30h × √(7/365)`, rentang = harga ± σ.
  Tidak ada kemiringan arah — model tidak memprediksi besarnya gerakan.

### 1.4 FEAR & GREED — contoh: **63 GREED, +18.9% 24h**

- Sumber: **alternative.me** (indeks 0–100 milik mereka, gabungan volatilitas, volume, sosial,
  dominasi, trends).
- `+18.9%` = perubahan dibanding hari sebelumnya: `(63 − 53)/53`.
- Zona di bar: 0–25 Extreme Fear, 25–45 Fear, 45–55 Neutral, 55–75 Greed, 75–100 Extreme Greed.

### 1.5 PRICE ACTION (grafik candle)

- Candle BTC/USD sesuai tombol timeframe. OPEN/HIGH/LOW/CLOSE/VOLUME = candle terakhir.
- Volume dalam **BTC** saat dari Coinbase/Kraken, dalam **USD** saat jatuh ke Yahoo.

### 1.6 LIVE INTELLIGENCE

- **SENTIMENT SCORE** (contoh +0.04, NEUTRAL): dari 40 judul berita RSS.
  `news = (positif − negatif)/total`, lalu `skor = 0.6 × news + 0.4 × (F&G − 50)/50`, dibatasi −1..+1.
  > 0.1 = bullish, < −0.1 = bearish.
- **BULLISH / NEUTRAL / BEARISH %**: porsi judul per label.
- **Penilaian judul** = kamus kata (`src/lib/sources/lexicon.ts`): setiap kata "naik" (surge,
  rally, inflow, approval, …) +1, setiap kata "turun" (crash, hack, outflow, ban, …) −1.
  **Bukan model NLP.**
- **Daftar berita**: 15 judul terbaru dari 8 feed (CoinTelegraph, Decrypt, NewsBTC, CoinDesk,
  The Block, Bitcoin Magazine, Blockworks, BeInCrypto). Diurutkan berdasarkan **impact**:
  - kategori dari kata kunci → skor dasar (SECURITY/MONETARY 70, REGULATION/ETF/GEOPOLITICS 60,
    LEGAL/ADOPTION 50, MARKET 40)
  - ditambah bonus kebaruan 0–20 (makin baru makin besar dalam jendela 7 hari)
  - impact > 65 = HIGH, 40–65 = MEDIUM, < 40 = LOW

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

## 2. MARKET

### 2.1 PRICE — `/market/price`

- **PRICE ACTION**: grafik candle yang sama dengan Overview, ditambah garis level.
- **SUPPORT / RESISTANCE**: *pivot point* klasik dari candle **terakhir yang sudah tutup**:
  - `pivot = (H + L + C)/3`
  - `R1 = 2·pivot − L`, `S1 = 2·pivot − H`
  - `R2 = pivot + (H − L)`, `S2 = pivot − (H − L)`
  - **VWAP** = rata-rata harga tipikal `(H+L+C)/3` dibobot volume, dari ~1/3 jendela candle
    terakhir (minimal 20 candle)

### 2.2 TECHNICALS — `/market/technicals`

| Panel | Isi |
|---|---|
| RSI (14) | Garis RSI; label OVERBOUGHT > 70, OVERSOLD < 30, sisanya NEUTRAL |
| MACD | MACD, signal, histogram (MACD − signal); MOMENTUM UP kalau histogram ≥ 0 |
| MOVING AVERAGES | EMA 5/8/13/21 dan jaraknya ke EMA5 (EMA5 dipakai sebagai pengganti harga spot) |
| BOLLINGER BANDS | Atas/tengah/bawah: SMA20 ± 2 std dev; BANDWIDTH = (atas − bawah)/tengah |

---

## 3. QUANTITATIVE

### 3.1 VOLATILITY — `/quant/volatility`

- **REALIZED VOL 30D / 90D**: std. dev. log-return harian × √365 × 100 (120 candle harian).
- **30D − 90D SPREAD**: positif = volatilitas jangka pendek lebih tinggi (pasar sedang bergejolak).
- **VOLATILITY TERM CURVE** dan **VOL TERM STRUCTURE**: ⚠️ **hasil model sederhana, bukan data
  pasar**. Hanya garis lurus melalui dua titik nyata (vol 30 hari dan 90 hari):
  `vol(t) = vol30 + (vol90 − vol30)/60 × (t − 30)`, minimum 0.5%.
  Labelnya memang menulis "MODELLED FROM 30D/90D".

### 3.2 SEASONALITY — `/quant/seasonality`

- **MONTHLY RETURN HEATMAP**: return tiap bulan kalender = `(close terakhir − close pertama)/close
  pertama` dari candle harian di bulan itu.
- Sumber: Kraken (~720 hari ≈ 2 tahun), fallback CoinGecko 365 hari. Jadi hanya **±24 sel**,
  bukan bertahun-tahun — jangan dibaca sebagai pola musiman yang kuat.

---

## 4. ON-CHAIN

### 4.1 SUPPLY — `/chain/supply`

| Panel | Asal |
|---|---|
| ON-CHAIN ACTIVITY | Hashrate (blockchain.info, EH/s), alamat aktif harian, jumlah transaksi harian (blockchain.info charts), volume 24 jam BTC (Blockchair) |
| COLD / HOT SUPPLY SPLIT | Saldo **17 alamat exchange yang dilacak** (Binance ×6, Bitfinex ×2, Coinbase ×2, Bitstamp, Bybit, Kraken, OKX, Robinhood) via Blockstream Esplora. `cold% = cold/total`, `hot% = (hot + deposit)/total` |

⚠️ Pembagian cold/hot hanya mewakili **sampel 17 alamat**, bukan seluruh BTC di exchange.

### 4.2 FLOWS — `/chain/flows`

Semua dari 17 alamat exchange yang sama (Blockstream Esplora):

- **EXCHANGE RESERVE**: total saldo alamat yang dilacak + porsi hot/cold/deposit.
- **FLOW RADAR / FLOW SUMMARY**: transaksi terbaru ≥ **50 BTC** yang menyentuh alamat itu
  (maksimum 40, di-dedup per txid), diklasifikasikan:

  | Jenis | Arti | Bias |
  |---|---|---|
  | EXCHANGE_INFLOW | masuk ke exchange (siap dijual) | bearish |
  | EXCHANGE_OUTFLOW | keluar dari exchange | bullish |
  | HOT_LOADING | cold → hot di exchange yang sama | bearish |
  | COLD_STORING | hot → cold di exchange yang sama | bullish |
  | INTER_EXCHANGE | exchange A → exchange B | netral |

- **EXCHANGE NETFLOW**: `netflow = Σ inflow − Σ outflow` dari transaksi di atas.
  Positif = lebih banyak BTC masuk exchange (tekanan jual).

### 4.3 NETWORK — `/chain/network`

Sumber: **mempool.space** (+ Blockchair untuk blok 24 jam & rata-rata fee USD).

| Panel | Isi |
|---|---|
| FEE STRIP | Fee rekomendasi (sat/vB): fastest, half-hour, hour, economy, minimum |
| MEMPOOL | Jumlah tx menunggu, ukuran (vMB), perkiraan blok untuk mengosongkan, distribusi fee |
| DIFFICULTY | Progres epoch (2016 blok), perkiraan perubahan difficulty berikutnya, sisa blok & perkiraan waktu retarget, rata-rata waktu blok |
| HASHRATE | Seri hashrate 3 bulan; `perubahan = (terakhir − pertama)/pertama` |
| MINING POOLS | Porsi blok per pool |

### 4.4 DERIVATIVES — `/chain/derivatives`

| Panel | Asal & rumus |
|---|---|
| FUNDING RATE | Rata-rata funding perp **Bybit + OKX + Binance** (per 8 jam). Annualised = `rate × 3 × 365 × 100`. Positif = long bayar short (pasar condong long) |
| OPEN INTEREST | OI BTCUSDT perp Bybit 48 jam; `perubahan 24h = (OI terakhir − OI awal)/OI awal`. **Basis** = `(harga mark perp − spot Coinbase)/spot` |
| DVOL | Indeks volatilitas implisit 30 hari Deribit; perubahan 7 hari |
| PUT/CALL · MAX PAIN | Buku opsi Deribit: rasio OI put/call, total OI opsi, strike *max pain* (strike di mana nilai opsi yang kedaluwarsa paling kecil) |

### 4.5 POSITIONING — `/chain/positioning`

Sumber: Binance Futures (48 jam, per jam) + Coinbase + Bybit.

| Panel | Isi |
|---|---|
| POSITIONING KPIs | Rasio long/short **retail** (semua akun), **top trader** (akun besar), taker buy/sell, dan **bias** |
| LONG / SHORT | Grafik kedua rasio 48 jam |
| TAKER FLOW | Volume beli agresif − jual agresif per jam |
| COINBASE PREMIUM | `(harga Coinbase − harga Binance)/Binance`. Positif = permintaan spot AS kuat. Juga selisih harga antar-venue |

**Aturan bias** (ambang dipilih manual, `divergence = rasio top − rasio retail`):
1. divergence ≥ 0.5 → **bullish** (akun besar jauh lebih long dari retail)
2. divergence ≤ −0.5 → **bearish**
3. retail ≥ 1.2 (retail terlalu long) → **bearish** (kontrarian, rawan squeeze)
4. retail ≤ 0.85 (retail terlalu short) → **bullish**
5. selain itu → **neutral**

### 4.6 ETF — `/chain/etf`

Sumber: tabel **bitbo.io** (di-scrape, bentuk tabel divalidasi). Data settle T+1.

| Panel | Rumus |
|---|---|
| FLOW KPIs | Net flow sesi terakhir (US$ juta), total 10 sesi, *streak* (berapa sesi berturut-turut searah), hari terbesar, jumlah hari hijau |
| ETF NET FLOW | Bar net flow harian 10 sesi |
| BY ISSUER | Net per ETF (IBIT, FBTC, …) di 10 sesi + porsi aktivitas kotor `|flow| / Σ|flow|` |
| FLOW MATRIX | Tabel sesi × issuer, diwarnai sesuai besaran |

---

## 5. SENTIMENT — `/sentiment`

### 5.1 Strip ringkasan

| Sel | Asal |
|---|---|
| FEAR & GREED | alternative.me (lihat 1.4) |
| SOCIAL SCORE | Skor sentiment 1.6; > 0.1 NET BULLISH, < −0.1 NET BEARISH, sisanya BALANCED |
| SENTIMENT MIX | Porsi judul positif/netral/negatif |
| NEWS TONE | Hitungan judul +/− dari daftar berita |
| WHALE FLOW 24H | Dari tabel `whale_events` (Whale Alert, transfer ≥ $500K): net USD masuk/keluar exchange 24 jam. **MOCK** sampai `WHALE_ALERT_API_KEY` + ingest berjalan |
| WORLD EVENTS | Jumlah event di peta + berapa dalam 24 jam |

### 5.2 GLOBAL EVENT MAP

- Menggabungkan 3 aliran: berita kripto RSS, berita dunia (BBC, AP, Al Jazeera, Guardian, France24,
  UN), dan siaran pers lembaga (**SEC, Federal Reserve, CFTC, ECB**), plus transfer flow on-chain.
- Tiap judul: kategori (kata kunci), sentimen (kamus), lokasi (gazetteer nama negara/kota; siaran
  pers lembaga dipin ke kantornya kalau tidak menyebut lokasi). Judul tanpa lokasi dibuang.
- **Impact** = skor kategori + bonus kebaruan (0–20) + bonus **diberitakan banyak sumber**
  (+5 per sumber tambahan, maks +15). Kalender makro tetap (FOMC, CPI, dll.) selalu tampil
  sebagai penanda impact rendah.
- Filter kategori lewat `?cats=`.

### 5.3 WHALE WIRE

Daftar transfer besar dari Supabase `whale_events`, ditulis oleh `/api/ingest/whale` setiap
5 menit (Whale Alert free tier hanya melihat ~10 menit ke belakang, jadi riwayat harus dikumpulkan).

---

## 6. MACRO

### 6.1 DATA — `/macro/data?country=US`

**Butuh `FRED_API_KEY`** (tanpa key = MOCK). Empat seri FRED per negara:

| Negara | CPI | Suku bunga | Pertumbuhan | Inflasi inti |
|---|---|---|---|---|
| US | CPIAUCSL | FEDFUNDS | Real GDP QoQ annualised | Core CPI |
| EU | HICP | ECB deposit rate | Real GDP | HICP |
| JP | CPI | Discount rate BoJ | Real GDP | CPI |
| GB | CPI | BoE rate | Real GDP | CPI |
| CN, ID | tidak ada seri gratis yang andal → **sengaja MOCK** | | | |

Tiap metrik juga punya **z-score**: `(nilai terakhir − rata-rata 24 observasi)/std dev`.

### 6.2 MARKETS — `/macro/markets`

Sumber: **Yahoo** (tanpa key) — DXY, S&P 500, VIX, emas, US 10Y.

| Panel | Rumus |
|---|---|
| Z-SCORE STRIP | z-score level terakhir vs 1 tahun |
| MARKETS TABLE | Level, perubahan 1 hari, 5 hari, 30 hari |
| CORRELATION BARS | Korelasi 30 sesi dengan BTC, **dicocokkan per tanggal** (bursa saham tidak buka akhir pekan, jadi tidak disejajarkan per indeks array) |

### 6.3 REGIME — `/macro/regime`

**REGIME QUADRANT** (butuh FRED): posisi negara di bidang **z pertumbuhan × z inflasi**:

| | Inflasi turun (z < 0) | Inflasi naik (z ≥ 0) |
|---|---|---|
| **Pertumbuhan naik (z ≥ 0)** | GOLDILOCKS | REFLATION |
| **Pertumbuhan turun (z < 0)** | DEFLATION | STAGFLATION |

Skor komposit = `(z pertumbuhan − z inflasi)/2` (positif = kondisi pro-risiko).

---

## 7. FORECAST

### 7.1 WEEKLY — `/forecast/weekly`

| Panel | Isi |
|---|---|
| WEEKLY REGIME FORECAST | Label model (lihat 1.1), `DATA AS OF` (tanggal candle terakhir yang dipakai), P(UP, 7D), zona BEAR < 23% / NO SIGNAL / BULL > 70%, model train end (2023-05-29), F1 validation 59.0% / test 58.0% |
| DRIVER BREAKDOWN | Kontribusi tiap domain ke skor. `c = (0.23 + 0.70)/2 = 0.465`, `h = (0.70 − 0.23)/2 = 0.235`. Kontribusi domain = `(p_domain − c)/(2 × h)`; skor komposit = jumlahnya = `(p_up − c)/h`. Contoh: Universal `(0.136 − 0.465)/0.47 = −0.699`, Macro `(0.344 − 0.465)/0.47 = −0.258`, total **−0.957** |
| FORWARD RETURN RANGE | Pita volatilitas 1σ 7 hari (lihat 1.3), **bukan prediksi arah** |

Sinyal ditandai **basi** kalau umurnya > 9 hari.

### 7.2 DISTRIBUTION — `/forecast/distribution?h=1M`

Distribusi kemungkinan harga, **bukan arah**. Satu simulasi 4.000 jalur sampai 1 tahun; horizon
1W/2W/1M/3M/6M/1Y dibaca dari simulasi yang sama.

**Mesin: Filtered Historical Simulation (FHS)**
1. Ambil ±10 tahun close harian (Coinbase dipaging; fallback Kraken).
2. **Hapus drift**: kurangi rata-rata return, supaya median = harga sekarang (tanpa bias naik
   dari sejarah BTC).
3. Fit **GARCH(1,1)** (fallback EWMA λ=0.94) → volatilitas kondisional per hari.
4. Bagi return dengan volatilitasnya → residual standar; ambil acak residual itu dan kalikan
   kembali dengan jalur volatilitas GARCH. Hasilnya: ekor tebal + volatility clustering tetap ada.
5. Seed acak = tanggal UTC, jadi angka stabil sepanjang hari.

| Panel | Isi |
|---|---|
| PRICE DISTRIBUTION (fan chart) | 90 hari harga nyata + kerucut persentil 5/10/25/50/75/90/95 |
| OUTCOME DENSITY | Histogram harga akhir di horizon terpilih |
| HORIZON TERM STRUCTURE | Per horizon: P5…P95, *expected move* `(P75 − P25)/2/spot`, rentang `(P95 − P5)/spot`, dan berapa jendela non-tumpang-tindih di sejarah (makin sedikit = makin tidak pasti) |
| PROBABILITY ABOVE | Porsi jalur simulasi yang berakhir **di atas** level: angka bulat di sekitar spot ± pivot R1/R2/S1/S2 |
| MODEL STATE | σ sekarang vs σ jangka panjang (annualised), konvergensi GARCH, dan **DVOL Deribit** sebagai pembanding dari pasar opsi |

### 7.3 CALIBRATION — `/forecast/calibration?h=1M`

Backtest walk-forward: apakah kerucut di 7.2 bisa dipercaya?
- 40% awal sejarah hanya untuk fit; **±110 titik asal** sesudahnya diuji **out-of-sample**.

| Panel | Cara baca |
|---|---|
| BAND COVERAGE | Pita 50/80/90% seharusnya memuat hasil nyata 50/80/90% kali. Jauh di bawah = terlalu sempit |
| PIT HISTOGRAM | Rata = terkalibrasi; bentuk U = pita terlalu sempit; bentuk gunung = terlalu lebar |
| ENGINE COMPARISON | FHS vs i.i.d. sederhana pada titik yang sama, termasuk *pinball loss* (ketajaman). Kalau FHS tidak lebih baik, terlihat di sini |

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
| 3 | `signal_rule.json` (model mingguan) | Ambang 0.23/0.70 bukan hasil tuning notebook; di data test `p_up` maksimum 0.699, jadi BULL tidak pernah muncul | Label BULLISH/BEARISH/NEUTRAL belum bisa dipertanggungjawabkan sampai ambang baru dari notebook |
| 4 | Label berita (kategori, bullish/bearish, impact) | Daftar kata & skor dipilih manual, tanpa data berlabel atau uji akurasi. Pencocokan per potongan huruf: "Hard**war**e" → GEOPOLITICS, "P**red**ict" → bearish, "Central **ban**k" → bearish + REGULATION | Label bisa salah dan bias |
| 5 | ONCHAIN confluence | Konstanta 50, belum disambungkan ke data on-chain (padahal On-Chain Flows/Network sudah live) | 6% skor tidak bergerak |
| 6 | `StatusFooter.tsx` | Warning hydration mismatch ("2s ago" vs "1s ago") di konsol browser | Kosmetik, tidak merusak data |

## 10. Key yang membuka panel MOCK

| Key | Membuka |
|---|---|
| `FRED_API_KEY` | Macro Data, Macro Regime, + 12 kolom makro model mingguan |
| `WHALE_ALERT_API_KEY` + `CRON_SECRET` + Supabase | Whale Flow 24H, Whale Wire |
| `COINGECKO_API_KEY` (opsional) | Batas request CoinGecko lebih longgar |
| Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | Menyimpan sinyal model & whale events di database, bukan file lokal |
