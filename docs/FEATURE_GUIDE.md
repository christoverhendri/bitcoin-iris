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

**Asal angka:** skor gabungan internal dari **4 lapisan bukti**, masing-masing 0–100 (50 = netral),
dengan **bobot tetap yang dipilih manual** (tidak di-fit ke data):

| Lapisan | Bobot | Cara hitung |
|---|---|---|
| TECHNICAL | 0.34 → 0.362 | Rata-rata 4 sub-skor dari candle harian (300 hari): RSI(14) apa adanya; MACD hist `50 + clamp((macd−signal)/harga × 2000) × 50`; jarak EMA21−EMA50 (gap 5% = mentok); jarak harga ke tengah Bollinger(20) (5% = mentok) |
| SENTIMENT | 0.20 → 0.213 | `0.5 × Fear&Greed + 0.5 × NEWS` |
| NEWS | 0.20 → 0.213 | Judul RSS (hingga 20 per feed × 8 feed) dinilai kata kunci: `50 + (positif − negatif)/total × 50` |
| MACRO | 0.20 → 0.213 | Dari Yahoo: DXY (z-score 1 tahun, dibalik — dolar kuat = negatif), VIX (15→+1, 20→+0.5, 25→0, 35→−0.5, 45→−1), S&P 500 30 hari (+10% = mentok). Rata-rata sinyal → skala 0–100 |

ONCHAIN (bobot 0.06, **selalu 50**) **dihapus 19 Okt**: konstanta yang tampil seolah diukur. Bobot
sisanya dinormalisasi ulang dengan perbandingan lama (0.34 : 0.20 : 0.20 : 0.20, dibagi 0.94).
Penggantinya (mis. skor dari persentil power-law) diputuskan tim.

`overall = (0.34·TECH + 0.20·SENT + 0.20·NEWS + 0.20·MACRO) ÷ 0.94`

Contoh lama di bawah memakai rumus sebelum 19 Okt:

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

## 3. QUANTITATIVE — `/quant/seasonality`, `/quant/cycle`, `/quant/corridor`

Sub-tab Volatility dihapus (link lama diarahkan ke Seasonality).

### 3.1 MONTHLY RETURN HEATMAP — `/quant/seasonality`

- **Sumber:** close harian **Coin Metrics** sejak 18 Jul 2010 (seri yang sama dengan Halving Cycle,
  satu fetch bersama, di-cache 1 hari). Sel pertama Agustus 2010.
- **Isi kotak (UTC):** `close terakhir bulan m ÷ close terakhir bulan sebelumnya − 1` — gerak hari
  pertama ikut terhitung. Hijau = naik, merah = turun.
- **BERJALAN:** bulan yang memuat data terakhir (month-to-date), kotak bergaris, **tidak** masuk
  ringkasan. Begitu ada close tanggal 1 bulan baru, sel bulan baru muncul sebagai BERJALAN dan bulan
  sebelumnya jadi final — tanpa edit kode.
- **Ringkasan per bulan kalender** (tanpa bulan berjalan): RATA-RATA, MEDIAN, **% TAHUN NAIK**
  (`tahun naik ÷ jumlah tahun`, mis. `7/11`). Catatan sejarah, bukan jaminan.

### 3.2 HALVING CYCLE — `/quant/cycle`

Semua dihitung ulang tiap render dari close harian Coin Metrics (cadangan blockchain.com) dan data
blok; tidak ada tanggal yang diketik. Metode: [DECISIONS §14–15](DECISIONS.md); definisi juga di
tooltip **METODOLOGI**.

- **Tanggal halving** = timestamp blok di tiap kelipatan 210.000 (mempool.space, cadangan
  blockchain.info, terakhir daftar historis yang diuji). Saat blok 1.050.000 lahir, siklus 5 terbuka
  sendiri dan target berikutnya pindah ke 1.260.000.
- **Status siklus berjalan:** `MENUNGGU TOP` (belum ada top) → `TOP SEMENTARA` (puncak siklus, harga
  sudah ≥40% di bawahnya) → `BOTTOM TERKONFIRMASI` (bottom sudah naik ≥ +100% tanpa low lebih rendah) →
  `SIKLUS SELESAI` (top final: turun ≥60% lalu ditembus lagi).

| Panel | Isi |
|---|---|
| KPI | Status · hari sejak halving · top (final/sementara) & harga sekarang vs top · bottom (terkonfirmasi atau "terendah sejauh ini", naik berapa dari bottom) · perkiraan sesuai status (tanggal tengah + 80%, plus cek silang) · halving berikutnya (tanggal, hitung mundur, rentang) |
| Perkiraan per status | MENUNGGU TOP: top = halving + jeda halving→top; bottom = rantai halving + jeda + jarak top→bottom (Monte Carlo deterministik 20.000 sampel). TOP SEMENTARA: bottom = top + jarak top→bottom; top berikutnya = halving berikutnya + jeda (cek silang top + jarak top→top). Bottom terkonfirmasi / selesai: top berikutnya (cek silang bottom + jarak bottom→top) |
| Penanda | `LEWAT JENDELA PROYEKSI` kalau hari ini melewati batas atas 80% dan kejadiannya belum terkonfirmasi; `DI LUAR POLA HISTORIS` kalau lewat batas atas 95% |
| Keterangan | "Berdasarkan {n} siklus selesai · rentang 80% · uji mundur: rata-rata meleset {x} hari" — n dan x dihitung |
| Halving berikutnya | `sisa blok × menit per blok`; tengah = rata-rata waktu blok epoch sekarang (mempool `timeAvg`); rentang = min/max dari itu, rata-rata epoch halving terakhir, dan 10 menit |
| PETA SIKLUS | Close mingguan (log) sejak 2012, garis halving dari blok, top/bottom (penuh = pasti, kosong = sementara), area 80% perkiraan yang aktif. Hover: tanggal + harga |
| BERAPA LAMA TIAP FASE | Halving→top, top→bottom, top→top, bottom→top: nilai per siklus, rata-rata, rentang 80%. Baris bertambah sendiri saat siklus berikutnya selesai |

Contoh 19 Okt 2026: TOP SEMENTARA; bottom ±19 Okt 2026 (80%: 29 Agu – 10 Des 2026); top siklus 5
±11 Agu 2029; halving ±4 Apr 2028 (waktu blok 9,87 menit). Tidak ditampilkan (tetap di notebook
`research/`): peluang bottom per bulan, skenario harga, thesis populer, tabel uji mundur, kelipatan &
drawdown.

### 3.3 POWER-LAW — `/quant/corridor`

`log10(harga) = a + b·log10(hari sejak genesis)`, di-fit ulang otomatis tiap awal bulan hanya dengan
data sebelumnya. **Persentil** = berapa persen selisih masa lalu ≤ selisih hari ini (0 = paling
murah, 100 = paling mahal). Zona: batas 10 / 30 / 70 / 90.

| Panel | Isi |
|---|---|
| POSISI HARGA | Persentil hari ini + zona (meteran), tangga harga pita P5…P95 hari ini dengan close terakhir di dalamnya, eksponen b terbaru dan pergeserannya (2014 6,54 → sekarang 5,64) |
| KORIDOR POWER-LAW | Harga di pita dari fit terbaru (pita masa lalu memakai pengetahuan sekarang) + persentil walk-forward dengan garis 10/30/70/90. Hover: tanggal, harga, persentil, pita |

Tidak ditampilkan (riset, di notebook): uji per zona, episode sentuh pita, persentil di top/bottom,
pita di tanggal proyeksi.

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

**JADWAL MAKRO AS** (19 Okt): 6 rilis terdekat — FOMC (dari halaman kalender federalreserve.gov,
parser gagal-keras, diuji dengan salinan halaman), CPI dan NFP (FRED `release/dates` dengan
`include_release_dates_with_no_data=true`, release id 10 dan 50), dengan hitung mundur hari.
Sumber yang gagal disebut di panel dan jadwalnya tidak ditampilkan; semua gagal → panel
disembunyikan. Tidak ada tanggal manual. (Marker "FOMC / CPI" statis di peta event sudah dihapus
16 Okt; peta tetap hanya berita.)

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

### 7.2 MONTHLY FORECAST — `/forecast/30d` (model Timothy)

Monte Carlo 30 hari dari worker Python Timothy, dibuat **seminggu sekali** (Senin 00:20 UTC), tidak
dihitung saat halaman dibuka. Metode dan alasan: [DECISIONS §16](DECISIONS.md).

| Panel | Isi |
|---|---|
| PRAKIRAAN 30 HARI · MONTE CARLO | 120 close terakhir + kisaran 50/80/90% tiap hari D+1…D+30 dan ±24 jalur simulasi nyata (dipilih dari terendah ke tertinggi). Drift dibuang → garis tengah ≈ harga sekarang: **kisaran, bukan arah**. Hover: tanggal, harga atau kisaran hari itu |
| KISARAN HARGA PER HARI | D+1 / 7 / 14 / 21 / 30: SANGAT RENDAH (P5), RENDAH (P25), TENGAH (P50), TINGGI (P75), SANGAT TINGGI (P95), dengan % dari harga as-of |
| SEBERAPA BISA DIPERCAYA | Uji mundur tanpa kebocoran: berapa persen harga sungguhan masuk kisaran 80% (19 Okt: 80% / 82% / 80% di 7 / 14 / 30 hari); galat median 30 hari 11,8% = sama dengan tebakan "harga tetap" (model tidak menebak arah). Lalu tabel prakiraan minggu-minggu sebelumnya vs harga sungguhan (terisi mulai minggu kedua). Sumber gejolak awal: DVOL Deribit × faktor VRP (19 Okt: 38,8% × 0,80 = 31,2%/tahun) |

Contoh 19 Okt (as-of 18 Okt, harga Coinbase $82.007): D+30 SANGAT RENDAH $65.280 · TENGAH $81.986 ·
SANGAT TINGGI $102.321.

### FORWARD VALIDATION (panel di Weekly dan Monthly)

Penilaian prakiraan yang sudah terbit, tanpa prediksi ulang ([DECISIONS §17](DECISIONS.md)).
- **Weekly:** tiap sinyal tutup minggu dinilai 7 hari kemudian dengan aturan label training (gerak
  kecil tidak dihitung): jumlah tepat, kisaran wajar 90%, pembanding "selalu naik", dan tabel per minggu.
- **Monthly:** seri tidak tumpang tindih per jangka (7 hari = semua run, 14 = tiap run kedua, 28 = tiap
  run keempat): berapa kali harga sungguhan masuk kisaran 80% dibanding yang wajar kalau model benar.
- Panel menulis **BELUM** sampai sampel cukup (26 minggu / 12 jendela). Sinyal pertama: 18 Okt 2026,
  dinilai mulai 25 Okt.

### DISTRIBUTION — dihapus 19 Okt

Tab Distribution (simulasi FHS + GARCH yang dihitung di dashboard saat halaman dibuka, jangka 1W–1Y,
dengan tombol HORIZON) dihapus: tab Monthly menjawab pertanyaan yang sama dengan mesin yang sama,
tapi gejolak awal dari DVOL, run disimpan, diuji mundur, dan dinilai forward. `/forecast/distribution`
dan `/forecast/calibration` diarahkan ke `/forecast/30d`.

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
| 5 | ~~ONCHAIN confluence~~ | ~~Konstanta 50~~ — **selesai 19 Okt**: lapisan dihapus, bobot dinormalisasi ulang | — |
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
