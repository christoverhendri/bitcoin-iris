# IRIS BTC Terminal — Daftar Fitur

Ringkasan semua fitur dashboard per 20 Oktober 2026 (branch `final-iris-terminal`). Rumus dan
detail tiap panel ada di [`FEATURE_GUIDE.md`](FEATURE_GUIDE.md); alasan tiap keputusan di
[`DECISIONS.md`](DECISIONS.md).

---

## Aturan umum (berlaku di semua tab)

| Aturan | Artinya |
|---|---|
| **Tidak ada data dummy** | Kalau sumbernya gagal atau belum disiapkan, panel diganti satu baris "data belum tersedia (alasan)". Angka contoh tidak pernah tampil. |
| **Tidak ada konten statis** | Semua angka dan tanggal dihitung dari data saat halaman diperbarui. Dijaga otomatis oleh tes `no-static-dates` dan aturan ESLint yang melarang kode non-tes membaca file fixture. |
| **Anti data basi** | Umur data diambil dari data itu sendiri. Lewat batasnya → badge merah **STALE**. Cache yang terlalu tua diambil ulang; kalau gagal, pindah ke sumber cadangan. |
| **Real-time** | Halaman memperbarui diri tiap 30 detik selama tab terbuka. |
| **Hover di semua grafik** | Arahkan kursor untuk melihat tanggal dan nilainya. |
| **Bahasa sederhana** | Penjelasan 1–2 kalimat berbahasa Indonesia di tiap panel. Nama persentil: SANGAT RENDAH … SANGAT TINGGI. |
| **Tidak ada info dobel** | Satu angka hanya ditulis sekali di satu halaman. |
| **METODOLOGI** | Tooltip di halaman Quant berisi definisi dan ambang yang dipakai, diambil langsung dari `src/lib/quant/config.ts`. |

---

## 1. Overview — ringkasan satu layar

| Panel | Isi |
|---|---|
| **WEEKLY FORECAST** | Sinyal model mingguan (BULLISH/BEARISH). Confidence = seberapa sering sinyal ini benar di data uji (mis. 52,6% dari 266 minggu, dibanding tebakan dasar 47,9%). Skor P(naik) dibanding ambang 0,06, dan kisaran harga dari volatilitas. |
| **CONFLUENCE** | Skor gabungan 0–100 dari 4 lapisan: teknikal, sentimen, berita, makro. Lapisan on-chain yang dulu selalu bernilai 50 sudah dihapus. |
| **SOCIAL SENTIMENT** | Donut porsi postingan positif/netral/negatif dari Santiment (data tertunda ±30 hari karena paket gratis). |
| **FEAR & GREED** | Indeks alternative.me dengan zona warna dan perubahan 24 jam. |
| **PRICE ACTION** | Grafik candle BTC (Coinbase → Kraken → Yahoo), tombol 1D / 7D / 1M / 3M / 1Y / ALL, hover OHLC. |
| **BTC SNAPSHOT** | Harga terakhir, perubahan 24 jam, high/low, 7D/30D, volume, market cap, dominasi, realized vol. |
| **TECHNICALS** | RSI, MACD, jarak EMA, Bollinger, dan lainnya, sesuai timeframe. |
| **LIVE INTELLIGENCE** | Komposisi judul berita (positif/netral/negatif) dan daftar berita terbaru dengan label dari model sentimen. |

---

## 2. Quantitative

### 2.1 Seasonality — heatmap return bulanan (`/quant/seasonality`)

- Data harian **Coin Metrics** sejak Agustus 2010.
- Return bulan = close akhir bulan dibanding close akhir bulan sebelumnya.
- Bulan berjalan diberi tanda **BERJALAN** dan tidak dihitung di ringkasan. Bulan baru muncul sendiri begitu ada data tanggal 1.
- Ringkasan per bulan: rata-rata, median, **% tahun naik** (mis. 7/11), dan BEST/WORST.

### 2.2 Halving Cycle — siklus 4 tahunan (`/quant/cycle`)

- **Tanggal halving** diambil dari blockchain: timestamp blok ke-210.000, 420.000, dan seterusnya. Halving ke-5 masuk sendiri saat blok 1.050.000 lahir.
- **Status otomatis:**

  | Status | Kondisi |
  |---|---|
  | `MENUNGGU TOP` | Halving sudah terjadi, belum ada top |
  | `TOP SEMENTARA` | Harga sudah turun ≥40% dari puncak siklus |
  | `BOTTOM TERKONFIRMASI` | Harga sudah naik ≥ +100% dari bottom tanpa low baru |
  | `SIKLUS SELESAI` | Top final (turun ≥60% lalu ditembus lagi) + bottom terkonfirmasi |

- **Proyeksi sesuai status:** tanggal tengah + rentang 80% dari distribusi t. Proyeksi berantai memakai Monte Carlo deterministik. Ada cek silang dari metode kedua, dan penanda `LEWAT JENDELA PROYEKSI` atau `DI LUAR POLA HISTORIS`.
- **Halving berikutnya:** sisa blok × rata-rata waktu blok live dari mempool, dengan hitung mundur dan rentang.
- **Peta siklus:** grafik log sejak 2012 dengan garis halving, top/bottom (titik penuh = pasti, kosong = sementara), dan area perkiraan.
- **Tabel durasi fase:** halving→top, top→bottom, top→top, bottom→top — nilai per siklus, rata-rata, rentang 80%.
- **Keterangan dinamis:** "berdasarkan n siklus selesai · uji mundur rata-rata meleset x hari".
- Diuji parity dengan notebook riset, plus 6 simulasi pergantian waktu (T1–T6).

### 2.3 Power-Law — rainbow chart versi jujur (`/quant/corridor`)

- Garis log(harga) vs log(hari sejak genesis) di-fit ulang **tiap awal bulan** hanya dengan data masa lalu (walk-forward, tanpa hindsight).
- **Persentil 0–100** hari ini dan zona: Sangat murah / Murah / Wajar / Mahal / Sangat mahal, ditampilkan sebagai meteran.
- **Tangga harga:** pita P5 … P95 hari ini, dengan close terakhir disisipkan di posisinya.
- Pergeseran eksponen b dari waktu ke waktu.
- Grafik harga di dalam pita warna, plus seri persentil walk-forward.

---

## 3. On-Chain

| Sub-tab | Isi |
|---|---|
| **ETF FLOWS** (`/chain/etf`) | Aliran ETF Bitcoin spot AS (bitbo.io, T+1): sesi terakhir, net 10 sesi, hari terbesar, bar per sesi bertanggal, matriks per ETF. |
| **LONG / SHORT** (`/chain/long-short`) | Binance Futures 48 jam: rasio long/short retail dan top trader, taker flow per jam (BTC). |
| **WALLET & TRANSFER** (`/chain/wallets`) | 15 alamat bursa yang dilacak: cadangan cold/hot, netflow, **Flow Radar** transfer ≥50 BTC dengan jenisnya (inflow, outflow, hot loading, cold storing, inter-exchange). |

---

## 4. Global Sentiment (`/sentiment`)

- **Strip ringkasan:** Fear & Greed, komposisi sentimen, nada berita, jumlah event dunia.
- **Label sentimen = model Azan:**
  - Financial DistilRoBERTa ONNX + parser V3, dengan pembanding TF-IDF.
  - Label POSITIF / NETRAL / NEGATIF artinya nada teks, bukan ramalan harga.
  - Tiap judul diberi tanda REVIEW karena model masih tahap riset.
  - Kalau model mati: label "Heuristic · model unavailable".
- **Berita:** 8 feed RSS kripto plus **Watcher Guru** (Telegram, lewat pipeline Azan, diambil tiap menit).
- **Globe event dunia:** berita dunia, institusi (SEC, The Fed, CFTC, ECB), dan kripto di globe titik yang berputar sendiri, bisa ditarik dan di-zoom; titik = jumlah berita di satu tempat, warna = nada beritanya. Ada juga mode peta datar dan news rail.
- **Social sentiment** dari Santiment.
- **Whale Wire** disembunyikan sampai Supabase dan kunci Whale Alert disiapkan.

---

## 5. Macro (khusus AS)

| Sub-tab | Isi |
|---|---|
| **ECONOMIC DATA** (`/macro/data`) | CPI, suku bunga Fed, pertumbuhan GDP, inflasi inti (FRED), dibanding kebiasaan 2 tahun terakhir dalam kata. Ditambah **JADWAL MAKRO AS**: FOMC (dari situs The Fed), CPI dan NFP (dari FRED), dengan hitung mundur hari. |
| **MACRO REGIME** (`/macro/regime`) | Kuadran pertumbuhan × inflasi: Goldilocks / Reflation / Deflation / Stagflation / Normal. |
| **GLOBAL MARKETS** (`/macro/markets`) | DXY, S&P 500, VIX, emas, US 10Y: level, perubahan 1/5/30 hari, grafik 1 tahun, dan **korelasi 30 hari dengan BTC** (area abu-abu = terlalu lemah untuk disebut hubungan). |

---

## 6. Forecast

### 6.1 Weekly Forecast (`/forecast/weekly`)

- Model klasifikasi arah 7 hari: ensemble XGBoost dua domain (MacroCrossAsset + Universal).
- Diterbitkan sekali seminggu, setelah candle Minggu tutup.
- Driver breakdown per domain dan kisaran volatilitas.

### 6.2 Monthly Forecast — model Timothy (`/forecast/30d`)

- Monte Carlo 30 hari: FHS + GARCH, 10.000 jalur, gejolak awal dari **DVOL Deribit** × faktor VRP.
- Dibuat worker sekali seminggu dan disimpan, tidak dihitung saat halaman dibuka.
- Fan chart dengan hover, tabel kisaran D+1/7/14/21/30.
- Ringkasan uji mundur: kisaran 80% kena 80% / 82% / 80% di 7 / 14 / 30 hari.

### 6.3 Forward Validation (panel di kedua tab)

- **Weekly:**
  - Tiap sinyal tutup minggu dinilai 7 hari kemudian dengan aturan label yang sama seperti waktu training.
  - Yang ditampilkan: jumlah tepat, kisaran wajar 90%, dan pembanding "selalu naik".
- **Monthly:**
  - Seri **tidak tumpang tindih**: 7 hari (semua run), 14 hari (tiap run ke-2), 28 hari (tiap run ke-4).
  - Dicek berapa kali harga sungguhan masuk kisaran 80%, dibanding rentang yang wajar kalau model benar.
- **Aturan:**
  - Prakiraan yang sudah terbit tidak pernah diubah atau diprediksi ulang.
  - Panel menulis **BELUM** sampai sampel cukup: 26 minggu untuk weekly, 12 jendela untuk monthly.
  - Penilaian pertama: 25 Oktober 2026.

---

## 7. Di balik layar — worker dan scheduler

| Job | Jadwal (WIB) | Isi |
|---|---|---|
| `refresh_data` | tiap hari 07:15 | Data input model weekly (Yahoo, FRED, CoinGecko, blockchain.com, Google Trends, …) |
| `social_sentiment` | tiap hari 07:20 | Santiment |
| `monthly` | Senin 07:20 | Monte Carlo 30 hari Timothy, plus penilaian D+7/14/28 run sebelumnya |
| `clf_weekly` + `forward` | Senin 07:30 | Sinyal mingguan, plus penilaian sinyal minggu lalu (dicoba ulang kalau candle belum final) |
| `watcher_news` | tiap menit | Post Telegram Watcher Guru |
| `whale_ingest` | tiap 5 menit | Hanya kalau `IRIS_APP_URL` dan `CRON_SECRET` di-set |

- **Dua cara menjalankan:**
  - Daemon lokal: `python -m iris_worker.scheduler` (mengejar ketinggalan saat dinyalakan).
  - **GitHub Actions:** `model-worker.yml` dan `monthly-forecast.yml`. Baru terjadwal setelah di-merge ke `main`.
- **Penyimpanan:** Supabase (migrasi 0001–0010), atau file di `worker/out/` kalau tanpa Supabase.
- **Refresh tanpa pengunjung:** `POST /api/revalidate`, dilindungi `CRON_SECRET`.

### Menjalankan lokal

Dashboard + model sentimen:

```bash
npm run dev:sentiment
```

Scheduler worker (jendela terminal terpisah):

```bash
cd worker && .venv/Scripts/python.exe -m iris_worker.scheduler
```

---

## 8. Asal model dan riset

| Bagian | Dari |
|---|---|
| Model sentimen dan pipeline Watcher Guru | Azan (branch `azan-sentiment`) |
| Monthly forecast + worker + workflow | Timothy (`motmots/iris-monthly-forecast`) |
| Halving cycle dan power-law | Notebook `research/BTC_Halving_Cycle_PowerLaw.ipynb` |
| Model weekly | Export notebook klasifikasi (`worker/models/clf_7d`) |

---

## 9. Yang masih perlu disiapkan atau diperbaiki

- **Supabase belum dipasang.** Whale Wire tersembunyi. Untuk deploy perlu migrasi 0003, 0008, 0009, 0010 serta secrets di GitHub.
- **Forward validation** baru mulai menghasilkan angka 25 Oktober 2026, dan butuh ±6 bulan sampai 1 tahun untuk bisa disimpulkan.
- ~~**Technicals:** BOLLINGER %B selalu 50.0~~ diperbaiki 20 Okt 2026: %B sekarang dihitung dari close candle terakhir, dan kolom "ATR" diberi nama yang benar (lebar Bollinger).
- **Confluence:** pengganti lapisan on-chain (mis. dari persentil power-law) menunggu keputusan tim.
