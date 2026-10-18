# Tab ON-CHAIN & MACRO — Panduan Detail

Isi setiap panel di tab **On-Chain** (3 sub-tab) dan **Macro** (3 sub-tab) setelah kurasi
**18 Oktober 2026**: datanya dari mana, rumusnya, cara membacanya, dan batasannya. Contoh angka
dari dashboard lokal 18 Okt (setelah DNS diperbaiki). Ringkasan semua tab ada di
[`FEATURE_GUIDE.md`](FEATURE_GUIDE.md); alasan setiap keputusan di [`DECISIONS.md` §13](DECISIONS.md).

## Aturan yang berlaku untuk semua panel

| Aturan | Artinya |
|---|---|
| **Tidak ada data contoh** | Panel yang sumbernya gagal / belum dikonfigurasi disembunyikan, diganti satu baris "data belum tersedia (alasan)". |
| **Tidak ada data basi diam-diam** | Respons cache yang lebih tua dari 4× jendela cache-nya (min. 5 menit) diambil ulang langsung; kalau gagal, sumber cadangan dipakai atau panel disembunyikan. Data asli yang melewati batas panelnya diberi badge merah **STALE · umur**. |
| **Umur dari data** | `SOURCE: X · 3d ago` dihitung dari timestamp di data (sesi ETF, jam terakhir long/short, transfer terbaru), bukan waktu halaman dibuat. |
| **Auto-refresh** | Halaman diperbarui tiap 30 detik selama tab terbuka. |
| **Hover di setiap grafik** | Arahkan kursor: tanggal (atau jam) + nilai. |
| **Tidak ada info dobel** | Satu angka hanya ditulis sekali per halaman. |
| **Tanpa sigma** | Posisi relatif ditulis dengan kata: "jauh di atas / di atas / sekitar / di bawah / jauh di bawah biasanya" (batas ±1 dan ±2 simpangan baku — konvensi baca). |

> **Jaringan uji (18 Okt):** DNS Indosat memblokir Coinbase, Kraken, Binance, Bybit, OKX,
> Blockstream dan mempool.space (alamat palsu 114.7.173.245/246). Sebelum DNS diganti, harga BTC
> dan Flow Radar tampil dari cache 2–3 hari tanpa tanda — termasuk baris **PENDING** yang
> sebenarnya sudah lama terkonfirmasi. Dibuka dengan DNS 1.1.1.1 / 1.0.0.1 dan
> 2606:4700:4700::1111 / ::1001.

---

# BAGIAN 1 — ON-CHAIN

## 1.1 ETF FLOWS — `/chain/etf`

Arus masuk/keluar **ETF Bitcoin spot AS** dari tabel **bitbo.io** (di-scrape; bentuk tabel dan
total tiap baris divalidasi). Settle **T+1**: sesi terbaru adalah hari bursa sebelumnya.

| Panel | Contoh 18 Okt | Rumus / isi |
|---|---|---|
| LATEST SESSION | +$16.3M (15 Okt) | Net semua ETF di sesi terakhir |
| NET · 10 SESSIONS | −$723.3M (rata-rata −$72.3M/sesi) | Jumlah net sesi yang tersedia |
| LARGEST DAY | −$314.5M (7 Okt) | Sesi dengan net absolut terbesar |
| ETF NET FLOW PER SESI | bar per sesi, tanggal di bawahnya | Hover: tanggal + net + masuk/keluar |
| FLOW MATRIX | tabel sesi × ETF | Net per ETF per sesi (US$ juta) |

Catatan sumber: kolom US$ bitbo = aliran BTC × harga BTC saat halaman dibuat (5 sesi terbaru
cocok persis dengan riwayat BTC di halamannya), bukan nilai dolar pada hari itu.

## 1.2 LONG / SHORT — `/chain/long-short`

Sumber: **Binance Futures** BTCUSDT, data per jam, 48 jam terakhir.

| Panel | Contoh 18 Okt | Isi |
|---|---|---|
| RETAIL L/S | 1.684 (62.7% long) | `globalLongShortAccountRatio` — satu akun satu suara |
| TOP TRADER L/S | — | `topLongShortPositionRatio` — akun terbesar, dibobot ukuran posisi |
| LONG / SHORT (grafik) | dua garis, garis 1.00 = seimbang | Hover: jam UTC + kedua rasio |
| TAKER FLOW | bar per jam | Volume beli agresif − jual agresif, dalam **BTC** (dulu tertulis "$") |

Cara baca: rasio > 1 = lebih banyak yang bertaruh naik. Ini **satu bursa**, bukan seluruh pasar.
Batas umur 3 jam (`MAX_AGE_SEC.positioning`).

## 1.3 WALLET & TRANSFER — `/chain/wallets`

Sumber: **15 alamat bursa yang dilacak** (Binance ×6, Bitfinex ×2, Coinbase ×2, Bitstamp, Bybit,
Kraken, OKX, Robinhood) via Blockstream Esplora. Sampel, **bukan** seluruh dompet bursa.

| Panel | Contoh 18 Okt | Isi |
|---|---|---|
| EXCHANGE RESERVE | 1.15M BTC; cold 1.10M BTC · 95.8%, hot 47.77K BTC · 4.2% | Satu bar cold/hot (hot termasuk alamat deposit) |
| EXCHANGE NETFLOW | net 37.54K BTC keluar bursa; inflow 11.90K, outflow 49.44K | Dari transfer terbaru yang terlihat (±40 transfer, jendela tidak tetap) |
| FLOW RADAR | terbaru: 78 BTC masuk Bybit, 47 jam lalu | Transfer ≥ 50 BTC, diklasifikasikan di bawah |

| Jenis | Artinya | Bias (aturan) |
|---|---|---|
| EXCHANGE INFLOW | Dari luar masuk ke bursa | Bearish (siap dijual) |
| EXCHANGE OUTFLOW | Dari bursa keluar | Bullish (ditarik untuk disimpan) |
| HOT LOADING | Cold → hot, bursa yang sama | Bearish |
| COLD STORING | Hot → cold, bursa yang sama | Bullish |
| INTER EXCHANGE | Bursa A → bursa B | Netral |

- **PENDING** = transaksi sudah disiarkan tapi belum masuk blok — normal untuk beberapa menit.
- `SOURCE · 47h ago` = umur transfer besar terbaru. Transfer ≥ 50 BTC di 15 alamat ini memang
  jarang; datanya tetap diambil ulang (saldo tiap 10 menit, transaksi tiap 5 menit).

Dihapus 18 Okt: Supply (cold/hot dobel, aktivitas jaringan), Network, Derivatives, kartu
DEPOSIT, tabel FLOW SUMMARY, Coinbase Premium, Divergence, Bias · Opinion, Streak, IBIT Share,
By Issuer.

---

# BAGIAN 2 — MACRO

Hanya **Amerika Serikat**. Sumber: **FRED** (data ekonomi) dan **Yahoo Finance** (pasar).

## 2.1 DATA — `/macro/data`

| Metrik | Contoh | Seri FRED | Dibanding biasanya |
|---|---|---|---|
| CPI INDEX | 336.30 | CPIAUCSL (level) | di atas — level indeks terus naik, jadi hampir selalu "di atas" |
| POLICY RATE | 3.75% | FEDFUNDS (rata-rata bulanan) | sekitar biasanya |
| GDP GROWTH | +2.20% | A191RL1Q225SBEA (kuartalan, disetahunkan) | sekitar biasanya |
| INFLATION | 2.57% | CPILFESL `units=pc1` (inti, % per tahun) | sekitar biasanya |

"Biasanya" = rata-rata 2 tahun terakhir seri itu (24 data bulanan / 8 data kuartalan); "di atas"
/ "di bawah" = lebih dari 1 simpangan baku dari rata-rata itu. `SOURCE · 47d ago` = tanggal
observasi (data September, dirilis pertengahan Oktober), bukan berarti basi.

Penjaga kesegaran: seri bulanan > 120 hari atau kuartalan > **270 hari** → panel disembunyikan.
(Kuartalan dulu 200 hari dan kedaluwarsa 18 Okt: data kuartal diberi tanggal awal kuartal, dan Q2
= 1 Apr tetap terbaru sampai rilis Q3 akhir Oktober.)

## 2.2 REGIME — `/macro/regime`

Kuadran pertumbuhan (GDP) × inflasi inti, keduanya dibanding 2 tahun terakhir:

| | Inflasi di bawah biasanya | Inflasi di atas biasanya |
|---|---|---|
| **Pertumbuhan di atas biasanya** | GOLDILOCKS | REFLATION |
| **Pertumbuhan di bawah biasanya** | DEFLATION | STAGFLATION |

Kalau keduanya masih dalam ±1 simpangan baku → **NORMAL**, dengan catatan condong ke kuadran
mana. Contoh 18 Okt: NORMAL, sedikit condong ke DEFLATION (pertumbuhan dan inflasi inti sekitar
biasanya). "DEFLATION" bukan berarti harga turun. Composite impulse dihapus.

## 2.3 MARKETS — `/macro/markets`

| Kolom | Isi |
|---|---|
| LEVEL | Harga/level terakhir (US 10Y dalam %) |
| VS SETAHUN TERAKHIR | Posisi level dibanding setahun ini, dalam kata |
| 1D / 5D / 30D | Perubahan vs close 1 / 5 / 30 sesi sebelumnya (1D dulu salah: ±1 tahun) |
| 1Y | Grafik setahun; hover: tanggal + nilai |

**KORELASI 30 HARI DENGAN BTC** — satu grafik per pasar, korelasi return harian 30 hari bergulir
selama setahun, dicocokkan per tanggal. +1 = selalu searah, −1 = selalu berlawanan. Area abu-abu
= `|r| < 1.96/√30 ≈ 0.36`: dengan 30 data, nilai di dalamnya bisa terjadi karena kebetulan.
Contoh 18 Okt: S&P 500 +0.59 (searah dengan BTC); dolar, VIX, emas, US 10Y di dalam area abu-abu.

Diperbaiki 18 Okt: tanggal BTC dari CoinGecko (stempel 00:00 UTC hari D+1 = close hari D) dulu
tidak dikoreksi, sehingga BTC dibandingkan dengan pasar sehari kemudian dan semua korelasi
terbaca ±0. Kolom CORR, Z 1Y dan strip z-score dihapus.
