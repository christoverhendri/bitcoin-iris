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
- Volume dalam **BTC** saat dari Coinbase/Kraken, dalam **USD** saat jatuh ke Yahoo.

### 1.6 LIVE INTELLIGENCE

- **HEADLINE MIX** (BULLISH / NEUTRAL / BEARISH %): dari judul terbaru di 8 feed (hingga 40 per
  feed; 16 Okt: 183 judul, angkanya tampil di panel), berapa
  persen yang ditandai positif/netral/negatif oleh kamus kata. Murni hitungan.
  (Dulu ada "Sentiment Score" = `0.6 × berita + 0.4 × F&G`; bobotnya karangan, **dihapus 16 Okt**.)
- **Penilaian judul** = kamus kata (`src/lib/sources/lexicon.ts`): setiap kata "naik" (surge,
  rally, inflow, approval, …) +1, setiap kata "turun" (crash, hack, outflow, ban, …) −1.
  **Bukan model NLP.**
- **Daftar berita**: 10 judul terbaru dari 8 feed (hingga 15 per feed diambil; CoinTelegraph, Decrypt, NewsBTC, CoinDesk,
  The Block, Bitcoin Magazine, Blockworks, BeInCrypto), **diurutkan dari yang terbaru**. Tiap judul
  diberi kategori kata kunci (lihat 5.2) dan label bull/bear dari kamus kata.
  (Dulu ada label HIGH/MEDIUM/LOW IMPACT dari skor yang angkanya dipilih manual — **dihapus 16 Okt**.)

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
| SENTIMENT MIX | Porsi judul positif/netral/negatif (hitungan kamus kata), sama dengan HEADLINE MIX di 1.6; jumlah judulnya tampil di sel |
| NEWS TONE | Hitungan judul +/− dari daftar berita |
| WHALE FLOW 24H | Dari tabel `whale_events` (Whale Alert, transfer ≥ $500K): net USD masuk/keluar exchange 24 jam. **MOCK** sampai `WHALE_ALERT_API_KEY` + ingest berjalan |
| WORLD EVENTS | Jumlah event di peta + berapa yang terbit dalam 24 jam |

(Sel SOCIAL SCORE dihapus 16 Okt — lihat 1.6.)

### 5.1b SOCIAL SENTIMENT · BTC (Santiment)

**Isi:** donut proporsi postingan positif / netral / negatif tentang BTC untuk hari terbaru,
selisih "+X pts more positive than negative", dan kolom diverging 30 hari (positif ke atas,
negatif ke bawah, netral melintang di garis tengah; skala tetap 100% per sisi). Arahkan kursor
ke tiap kolom/irisan untuk angka lengkapnya.

**Sumber & rumus:** metrik Santiment `sentiment_{positive,neutral,negative}_ratio_total_1d`.
Definisi Santiment: jumlah postingan berlabel positif / netral / negatif ÷ jumlah ketiganya,
per hari, dari **Twitter, Reddit, Telegram, dan 4chan**. Labelnya dari classifier milik
Santiment (bukan dari kita). Ketiganya berjumlah 1; hari yang tidak berjumlah 1 ditolak worker
dan dicatat di `rejected_dates`.

**Jadwal:** job worker `social_sentiment` tiap hari 07:20 WIB (`SOCIAL_CRON`), 1 request per
hari (kuota gratis 1000/bulan). Output: Supabase `social_sentiment_daily` (migration 0005) atau
`worker/out/social_sentiment.json` saat lokal (`SOCIAL_SENTIMENT_LOCAL_FILE`).

**Batasan penting:** akun gratis Santiment **menyembunyikan 30 hari terakhir**. Jadi panel ini
menunjukkan sentimen ±30 hari yang lalu — tertulis di panel ("DATA AS OF … · 30 DAYS BEHIND").
Untuk data hari ini perlu paket berbayar Santiment.

### 5.2 GLOBAL EVENT MAP

- Menggabungkan 3 aliran: berita kripto RSS, berita dunia (BBC, AP, Al Jazeera, Guardian, France24,
  UN), dan siaran pers lembaga (**SEC, Federal Reserve, CFTC, ECB**), plus transfer flow on-chain.
- Tiap judul: kategori (kata kunci), sentimen (kamus), lokasi (gazetteer nama negara/kota; siaran
  pers lembaga dipin ke kantornya kalau tidak menyebut lokasi). Judul tanpa lokasi dibuang.
- Judul yang sama dari beberapa media dihitung satu event. Diurutkan dari yang terbaru; halaman Sentiment memuat 150 event terbaru.
- Semua marker berukuran sama. (Dulu ukuran marker = skor "impact" karangan, dan ada penanda
  statis "FOMC / CPI / ECB" yang ditempeli tanggal hari ini walaupun tidak ada kejadian — keduanya
  **dihapus 16 Okt**.)
- Filter kategori lewat `?cats=`.

**Aturan kategori** (`src/lib/geo/classify.ts`): judul dicocokkan ke daftar kata dari atas ke
bawah; kategori pertama yang cocok dipakai, kalau tidak ada yang cocok → MARKET.

| Urutan | Kategori | Kata kunci |
|---|---|---|
| 1 | REGULATION | sec, regulation, regulator, mica, ban, license, framework, compliance, oversight, watchdog, crackdown |
| 2 | ETF_FUND | etf, blackrock, grayscale, fidelity, ishares, inflow, outflow, aum, bitwise, ark invest |
| 3 | SECURITY | hack, exploit, breach, stolen, drain, phishing, rug pull, private key, compromised |
| 4 | MONETARY | fed, federal reserve, rate cut/hike, fomc, cpi, inflation, ecb, boj, pce, powell |
| 5 | GEOPOLITICS | sanction, war, election, conflict, tariff, invasion, ceasefire, military, missile, coup, summit |
| 6 | ADOPTION | legal tender, adopts, adoption, accepts bitcoin, integration, rollout, strategic reserve |
| 7 | LEGAL | lawsuit, court, ruling, settlement, indictment, sentenced, verdict, appeal, charges, trial |
| – | WHALE_FLOW | bukan dari judul: transfer on-chain ≥ 50 BTC dari 17 alamat exchange (lihat 4.2) |

**Seberapa baru datanya** — tidak real-time, tapi near real-time:

| Aliran | Sumber | Cache di dashboard |
|---|---|---|
| Berita kripto | 8 RSS media kripto | 10 menit |
| Berita dunia | BBC, AP, Al Jazeera, Guardian, France 24, UN News | 15 menit |
| Siaran pers lembaga | SEC, Federal Reserve, CFTC, ECB | 1 jam |
| Transfer on-chain | Blockstream Esplora (17 alamat exchange) | saldo 10 menit, transaksi 5 menit (alamat dengan riwayat > 2 MB tidak bisa di-cache, jadi diambil ulang tiap render) |
| Whale Wire | Supabase `whale_events`, diisi ingest tiap 5 menit | 30 detik |

Ditambah jeda dari media itu sendiri: RSS baru memuat artikel setelah media menerbitkannya.

### 5.3 WHALE WIRE

Daftar transfer besar dari Supabase `whale_events`, ditulis oleh `/api/ingest/whale` setiap
5 menit (Whale Alert free tier hanya melihat ~10 menit ke belakang, jadi riwayat harus dikumpulkan).
Yang ditampilkan: jumlah koin, nilai USD, jenis (inflow/outflow/…), arah bias, rute, chain, waktu.
(Label "HIGH/MEDIUM/LOW IMPACT" yang diturunkan dari nilai USD dengan ambang karangan **dihapus
16 Okt**; nilai USD-nya sendiri tetap ditampilkan karena itu fakta. Kolom `impact` di database
dibuang lewat migration `0004_drop_whale_impact.sql`.)

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
| 3 | ~~`signal_rule.json` (model mingguan)~~ | ~~Ambang 0.23/0.70 karangan~~ — **selesai 17 Okt**: dihapus, ambang kini `avg_threshold` 0.06 dari export notebook | — |
| 4 | Label berita (kategori, bullish/bearish) | Aturan kata kunci dipertahankan (rule-based), tapi pencocokannya per potongan huruf: "Hard**war**e" dan "Fed's **War**sh" → GEOPOLITICS, "P**red**ict" → bearish, "Central **ban**k" → bearish + REGULATION. Label bull/bear nanti diganti model researcher | Label bisa salah sampai pencocokan diubah ke per kata utuh |
| 5 | ONCHAIN confluence | Konstanta 50, belum disambungkan ke data on-chain (padahal On-Chain Flows/Network sudah live) | 6% skor tidak bergerak |
| 6 | `StatusFooter.tsx` | Warning hydration mismatch ("2s ago" vs "1s ago") di konsol browser | Kosmetik, tidak merusak data |

## 10. Key yang membuka panel MOCK

| Key | Membuka |
|---|---|
| `FRED_API_KEY` | Macro Data, Macro Regime, + 12 kolom makro model mingguan |
| `WHALE_ALERT_API_KEY` + `CRON_SECRET` + Supabase | Whale Flow 24H, Whale Wire |
| `COINGECKO_API_KEY` (opsional) | Batas request CoinGecko lebih longgar |
| `SANTIMENT_API_KEY` (di `worker/.env`) | Social Sentiment (Overview + Sentiment); data tertunda 30 hari di akun gratis |
| Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | Menyimpan sinyal model & whale events di database, bukan file lokal |
