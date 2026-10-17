# Tab ON-CHAIN & MACRO — Panduan Detail

Penjelasan setiap panel di tab **On-Chain** (6 sub-tab) dan **Macro** (3 sub-tab): isinya apa,
datanya dari mana, rumusnya, cara membacanya, dan batasannya. Contoh angka diambil dari
dashboard lokal **17 Oktober 2026**. Semua rumus dicek langsung di kode
(`src/lib/features/*/live.ts`, `src/lib/sources/*`, `src/components/features/*`).

> **Baca dulu — kondisi 17 Okt:** API bursa (Coinbase, Binance, Bybit, OKX, Deribit) sedang
> **diblokir ISP** (sertifikat yang diterima milik `*.ioh.co.id`, Indosat). Dashboard tetap
> menampilkan angka terakhir yang tersimpan di cache Next.js **tanpa badge MOCK**, jadi panel
> **Derivatives**, **Positioning**, dan harga Coinbase bisa berisi data lama. Lihat
> [Masalah yang ditemukan](#masalah-yang-ditemukan-17-okt-2026). Cara cepat mengecek: baris
> `SOURCE: … · Xh ago` di bawah panel.

---

## Ringkasan cepat

| Sub-tab | Pertanyaan yang dijawab | Sumber utama | Perlu untuk pemula? |
|---|---|---|---|
| On-Chain → **Supply** | Seberapa ramai jaringan Bitcoin dipakai? | blockchain.com, Blockchair, Blockstream | Rendah |
| On-Chain → **Flows** | Apakah BTC sedang masuk atau keluar dari bursa? | Blockstream (15 alamat bursa) | Sedang (dengan catatan) |
| On-Chain → **Network** | Berapa biaya transaksi, seberapa sibuk antrean, berapa kekuatan mining? | Blockchair, blockchain.com | Rendah |
| On-Chain → **Derivatives** | Apakah trader futures sedang berutang besar ke satu arah? | Bybit, OKX, Binance, Deribit | Sedang |
| On-Chain → **Positioning** | Trader kecil vs trader besar condong long atau short? | Binance Futures, Coinbase | Rendah–sedang |
| On-Chain → **ETF** | Apakah uang institusi masuk atau keluar dari ETF Bitcoin AS? | bitbo.io | **Tinggi** |
| Macro → **Data** | Inflasi, suku bunga, pertumbuhan ekonomi tiap negara | FRED | Sedang |
| Macro → **Regime** | Ekonomi sedang di fase apa? | FRED | Sedang (labelnya perlu dijelaskan) |
| Macro → **Markets** | Dolar, saham, emas, obligasi bergerak ke mana, dan seberapa searah dengan BTC? | Yahoo Finance | Sedang |

Istilah yang sering muncul:
- **MOCK** = data contoh karena sumber asli gagal/tidak tersedia. Selalu diberi badge.
- **z-score** = seberapa jauh angka sekarang dari rata-ratanya sendiri, dalam satuan
  simpangan baku. 0 = normal, +2 = jauh di atas biasanya, −2 = jauh di bawah.
- **Tracked subset** = hanya sampel alamat yang kita kenal, bukan seluruh pasar.

---

# BAGIAN 1 — ON-CHAIN

## 1.1 SUPPLY — `/chain/supply`

### Panel ON-CHAIN ACTIVITY (4 angka)

| Angka | Contoh 17 Okt | Sumber | Artinya |
|---|---|---|---|
| **ACTIVE ADDRESSES** | 480.30K | blockchain.com chart `n-unique-addresses` (hari terakhir) | Jumlah alamat unik yang aktif bertransaksi dalam sehari |
| **VOLUME 24H** | 757.99K BTC | Blockchair `/bitcoin/stats` → `volume_24h` | Total BTC yang berpindah di blockchain dalam 24 jam (termasuk "kembalian" ke dompet sendiri) |
| **TX COUNT** | 803.84K | blockchain.com chart `n-transactions` | Jumlah transaksi terkonfirmasi sehari |
| **HASH RATE** | 560.77 EH/s ⚠️ | blockchain.info `/q/hashrate` (GH/s ÷ 10⁹) | Total kekuatan komputer yang menambang. **Angka ini salah** — lihat catatan |

**Cara membaca:** naiknya alamat aktif dan jumlah transaksi = jaringan lebih ramai dipakai.
Ini indikator *aktivitas*, bukan arah harga.

**Batasan:**
- ⚠️ Endpoint `/q/hashrate` sekarang membalas **404**. Angka 560.77 EH/s adalah sisa cache;
  halaman Network (sumber lain) menunjukkan **1,055.6 EH/s**. Keduanya mengukur hal yang sama.
- `SOURCE · 4d ago`: data chart blockchain.com tertinggal beberapa hari.
- Kalau sebagian sumber gagal, seluruh panel jatuh ke MOCK (sengaja, supaya tidak setengah asli).

### Panel COLD / HOT SUPPLY SPLIT

| Angka | Contoh | Rumus |
|---|---|---|
| **COLD** | 95.83% | `saldo cold wallet ÷ total saldo alamat yang dilacak` |
| **HOT** | 4.17% | `(saldo hot + deposit) ÷ total` |

- Saldo dibaca dari **15 alamat bursa yang dilacak** lewat Blockstream Esplora (Binance ×6,
  Bitfinex ×2, Coinbase ×2, Bitstamp, Bybit, Kraken, OKX, Robinhood), di-cache 10 menit.
- **Cold** = dompet simpanan jangka panjang (tidak siap dijual). **Hot** = dompet operasional
  bursa (siap untuk penarikan/penjualan).
- ⚠️ Catatan panel bertuliskan *"address clustering — paid provider"*, padahal datanya **bukan**
  dari provider berbayar — ini sampel 15 alamat. Bursa memakai ribuan alamat, jadi persentase
  ini **tidak mewakili seluruh BTC di bursa**.

**Perlu untuk pemula?** Rendah. Angka aktivitas jaringan jarang langsung berkaitan dengan harga.

---

## 1.2 FLOWS — `/chain/flows`

Semua panel di sini memakai **15 alamat bursa yang sama** (di dashboard: "15 addresses
resolved · 8 exchanges" = semuanya berhasil dibaca). Judul panel menulis *"TRACKED SUBSET ·
SNAPSHOT · NO HISTORY"*: ini potret saat ini dari sampel, tanpa riwayat.

### Panel EXCHANGE RESERVE

| Angka | Contoh 17 Okt | Artinya |
|---|---|---|
| **TRACKED RESERVE** | 1.15M BTC | Total saldo 15 alamat yang dilacak |
| COLD STORAGE | 1.10M BTC | Disimpan, tidak likuid |
| HOT WALLETS | 47.76K BTC | Dompet operasional bursa |
| DEPOSIT | 6.51 BTC | Alamat setoran pelanggan |
| **NETFLOW (IN − OUT)** | −37.26K BTC · BULLISH | Lebih banyak BTC keluar dari bursa daripada masuk |

### Panel FLOW RADAR (tabel transfer)

Transaksi **≥ 50 BTC** yang menyentuh alamat yang dilacak, maksimal 40 terbaru (yang masih
di antrean tampil "PENDING"). Setiap transfer diklasifikasikan:

| Jenis | Artinya | Bias (aturan) | Alasan |
|---|---|---|---|
| EXCHANGE INFLOW | Dari luar masuk ke bursa | Bearish | BTC siap dijual |
| EXCHANGE OUTFLOW | Dari bursa keluar | Bullish | BTC ditarik untuk disimpan |
| HOT LOADING | Cold → hot, bursa yang sama | Bearish | Bursa menyiapkan likuiditas |
| COLD STORING | Hot → cold, bursa yang sama | Bullish | Bursa menyimpan kembali |
| INTER EXCHANGE | Bursa A → bursa B | Netral | — |

Kolom tabel: TIME, AMOUNT, KIND, BIAS, EXCHANGE, ROUTE (dari → ke).

### Panel EXCHANGE NETFLOW & FLOW SUMMARY

`INFLOW` = jumlah transfer EXCHANGE INFLOW, `OUTFLOW` = jumlah EXCHANGE OUTFLOW, `NETFLOW = IN − OUT`.
Contoh: inflow 12.19K, outflow 49.44K → netflow **−37.26K BTC** (net keluar).

**Batasan penting:**
- ⚠️ Netflow dihitung dari **40 transfer terakhir**, bukan jendela waktu tetap. Pada 17 Okt,
  40 transfer itu tersebar **±27 hari**, jadi "−37.26K" bukan angka harian/mingguan.
- Bias bullish/bearish adalah **aturan** (konvensi analis on-chain), bukan hasil yang diuji.
- Sampel kecil: satu transfer besar Binance bisa membalik angka.

**Perlu untuk pemula?** Sedang, dengan syarat diberi jendela waktu yang jelas (mis. 7 hari).

---

## 1.3 NETWORK — `/chain/network`

> Sumber: footer menulis "MEMPOOL SPACE", tapi sejak repo asal memindahkannya, data diambil dari
> **Blockchair `/bitcoin/stats`** dan **blockchain.com charts** (mempool.space memblokir banyak
> ISP). Detail di `src/lib/sources/mempool.ts`.

### Panel FEE STRIP

| Kotak | Contoh | Artinya |
|---|---|---|
| FASTEST | 2 sat/vB · next block | Biaya agar masuk blok berikutnya |
| 30 MIN | 2 sat/vB · ~3 blocks | |
| 1 HOUR | 1 sat/vB · ~6 blocks | |
| ECONOMY | 1 sat/vB · no deadline | |
| AVG FEE PAID | $0.26 · rata-rata 24 jam | Biaya rata-rata yang benar-benar dibayar |

⚠️ Keempat tingkat biaya **diturunkan dari satu angka "suggested" Blockchair**, bukan 4 estimasi
terpisah. `sat/vB` = satoshi per virtual byte (satuan biaya transaksi Bitcoin).

### Panel MEMPOOL

| Angka | Contoh | Rumus |
|---|---|---|
| Antrean | **98.6 blocks · CONGESTED** | `total ukuran antrean ÷ 1.000.000 vB` (kapasitas satu blok) |
| PENDING TX | 68.56K | Transaksi menunggu |
| TOTAL WEIGHT | 98.60M vB | Ukuran total antrean |

Tingkat: < 1 blok = CLEAR, < 6 = NORMAL, < 20 = BUSY, ≥ 20 = CONGESTED.
⚠️ Label hanya melihat **ukuran** antrean, bukan biaya. 17 Okt tertulis "CONGESTED" padahal fee
hanya 1–2 sat/vB (antreannya penuh transaksi murah yang tidak terburu-buru).

### Panel DIFFICULTY

Tingkat kesulitan mining disesuaikan setiap **2.016 blok** (±2 minggu) supaya rata-rata blok
tetap 10 menit.

| Angka | Contoh |
|---|---|
| Perkiraan perubahan berikutnya | −1.34% (estimasi; makin akurat makin dekat akhir epoch) |
| Progres epoch | 8.4% |
| Sisa blok | 1,847 (~13 hari) · retarget di blok #973,728, ±30 Okt |
| Rata-rata waktu blok | 10.1 menit (target 10.0) |
| Blok 24 jam | 151 (target 144) |
| Penyesuaian sebelumnya | — (tidak ada sumber gratis) |

### Panel HASHRATE

Grafik rata-rata harian ±3 bulan (blockchain.com). Contoh: sekarang **1,055.6 EH/s**, berubah
+1.83% dalam 3 bulan, puncak 1,161.1 EH/s, difficulty 140.6T.

### Panel MINING POOLS

Pembagian blok 7 hari terakhir (768 blok): Unknown 46.4%, AntPool 23.2%, F2Pool 17.7%,
ViaBTC 10.0%, … "Top 2 = 70%" = konsentrasi mining.

**Perlu untuk pemula?** Rendah. Ini kesehatan teknis jaringan; jarang relevan untuk keputusan
harga.

---

## 1.4 DERIVATIVES — `/chain/derivatives`

Halaman ini menegaskan di atasnya: angka adalah data dari bursa; tafsiran bullish/bearish adalah
**opini**.

### Panel FUNDING RATE

| Angka | Contoh | Rumus |
|---|---|---|
| Funding rata-rata | **+0.0078%** per 8 jam | Rata-rata Bybit, OKX, Binance |
| Annualised | +8.49% | `funding × 3 × 365` |
| Per bursa | Bybit +0.0073%, OKX +0.0100%, Binance +0.0060% | |
| BASIS | +0.099% | `(harga mark perp − harga spot Coinbase) ÷ spot` |

**Cara membaca:** funding positif = pemegang posisi **long** membayar yang short → pasar condong
long dengan leverage. Funding positif tinggi berkepanjangan = rawan *long squeeze*.

### Panel OPEN INTEREST

Jumlah kontrak futures yang masih terbuka di Bybit BTCUSDT, 48 jam terakhir.
Contoh: **58.55K BTC ≈ $4.81B**, +4.80% dalam 24 jam, rentang 48 jam 55,829–60,975 BTC.
OI naik = lebih banyak uang dengan leverage masuk.

### Panel DVOL

Indeks volatilitas tersirat Deribit: berapa besar pergerakan 30 hari ke depan yang "dihargai"
pasar opsi. ⚠️ 17 Okt: **kosong** ("no DVOL history returned") karena Deribit diblokir ISP,
tanpa badge MOCK.

### Panel PUT/CALL · MAX PAIN (Deribit)

| Angka | Contoh | Artinya |
|---|---|---|
| PUT/CALL OI ratio | 0.595 | < 1 = lebih banyak opsi call (taruhan naik) daripada put |
| Total option OI | 386.37K BTC | |
| MAX PAIN | $79,000 (−3.78% vs spot) | Harga di mana pemegang opsi secara kolektif paling rugi saat kedaluwarsa |

Max pain menggambarkan **di mana posisi menumpuk**, bukan ramalan harga.

**Batasan:** ⚠️ Semua bursa sumber sedang diblokir ISP; angka bisa berasal dari cache lama.
Label `· 0s ago` di halaman ini adalah **waktu render**, bukan waktu data.

**Perlu untuk pemula?** Sedang — funding rate bisa disederhanakan jadi "pasar sedang ramai
leverage long / short / seimbang".

---

## 1.5 POSITIONING — `/chain/positioning`

Sumber: **Binance Futures** (BTCUSDT, per jam, 48 jam) + Coinbase.

### Panel KPI

| Angka | Contoh | Sumber/rumus |
|---|---|---|
| RETAIL L/S | 1.550 (60.8% long) | `globalLongShortAccountRatio` — satu akun satu suara |
| TOP TRADER L/S | 1.423 (58.7% long) | `topLongShortPositionRatio` — akun terbesar, dibobot ukuran posisi |
| DIVERGENCE | −0.127 | `top trader − retail` |
| COINBASE PREMIUM | −0.2443% | `(harga Coinbase − harga Binance) ÷ Binance` |
| BIAS · OPINION | BEARISH | Aturan di bawah |

**Aturan bias** (ambang dipilih manual, ditandai "OPINION" di panel):
1. divergence ≥ +0.5 → bullish (akun besar jauh lebih long)
2. divergence ≤ −0.5 → bearish
3. retail ≥ 1.2 → **bearish** (retail terlalu long, rawan squeeze) ← kondisi 17 Okt
4. retail ≤ 0.85 → bullish
5. selain itu → netral

### Panel LONG / SHORT

Dua garis 48 jam: retail vs top trader. 1.00 = seimbang.

### Panel TAKER FLOW

Volume order *market* (yang membayar untuk eksekusi cepat): beli vs jual per jam.
Contoh: buy 184.21K, sell 193.42K, ratio jam terakhir 1.282.
⚠️ Satuan dari Binance adalah **BTC**, tapi panel menampilkannya dengan tanda **"$"**.

### Panel COINBASE PREMIUM

Selisih harga Coinbase (BTC-USD) vs Binance (BTCUSDT), skala tetap ±0.20%, plus tabel harga per
bursa. Positif = pembeli AS (institusi) membayar lebih mahal.

**Batasan:** ⚠️ `SOURCE · 32h ago` — data Binance berumur 32 jam (ISP). Harga Coinbase juga dari
cache lama, jadi premium −0.24% kemungkinan besar **artefak data basi**, bukan sinyal pasar.

**Perlu untuk pemula?** Rendah–sedang.

---

## 1.6 ETF — `/chain/etf`

Arus masuk/keluar dana **ETF Bitcoin spot AS** (IBIT/BlackRock, FBTC/Fidelity, GBTC, ARKB, dll).
Sumber: tabel **bitbo.io** (di-scrape; bentuk tabel dan total tiap baris divalidasi — kalau tidak
cocok, panel jadi MOCK). Data settle **T+1**: baris terbaru adalah sesi kemarin.

### Panel KPI

| Angka | Contoh 17 Okt | Artinya |
|---|---|---|
| LATEST SESSION | **+$16.2M** (15 Okt) | Net arus sesi terakhir |
| NET · 10 SESSIONS | −$722.4M (rata-rata −$72.2M/sesi) | Total 10 sesi terakhir |
| STREAK | 1 hari masuk · 3/10 sesi positif | Sesi berturut-turut searah |
| LARGEST DAY | −$314.1M (7 Okt) | Sesi dengan arus terbesar |
| IBIT SHARE | 34.6% | Porsi IBIT dari total aktivitas (kotor) |

### Panel lain

- **ETF NET FLOW** — bar net per sesi (skala simetris; $1 masuk dan keluar sama tinggi).
- **BY ISSUER** — net 10 sesi per ETF, arus sesi terakhir, dan porsi aktivitas kotor
  (`|arus ETF| ÷ Σ|arus semua ETF|`). Contoh: FBTC −$425.1M, ARKB −$119.7M, IBIT −$110.2M.
- **FLOW MATRIX** — tabel sesi × ETF dalam US$ juta.

**Cara membaca:** net positif berhari-hari = institusi sedang membeli lewat ETF. Ini adalah
"uang besar" yang paling mudah dipahami.

**Perlu untuk pemula?** **Tinggi** — panel on-chain paling relevan dan paling mudah dijelaskan.

---

# BAGIAN 2 — MACRO

Sub-tab Data dan Regime punya pilihan negara: **US, CN, EU, JP, GB, ID**.

| Negara | Status 17 Okt | Alasan |
|---|---|---|
| **US** | Live | Semua seri FRED aktual |
| **EU** | Live | Semua seri aktual |
| **JP** | MOCK | CPI Jepang di FRED berhenti Jun 2021 |
| **GB** | MOCK | CPI Inggris di FRED berhenti Mar 2025 |
| **CN, ID** | MOCK | Tidak ada seri gratis yang andal di FRED |

Penjaga kesegaran: negara dengan seri yang terlalu tua (bulanan > 120 hari, kuartalan > 200,
harian > 30) otomatis MOCK, bukan menampilkan angka lama sebagai terbaru.

## 2.1 DATA — `/macro/data?country=US`

### Panel MACRO METRICS + METRIC DETAIL

| Metrik | Contoh US | Seri FRED | Satuan | Catatan |
|---|---|---|---|---|
| **CPI INDEX** | 336.30 (z +1.81) | CPIAUCSL | Indeks (1982-84 = 100) | Level harga, bukan persen |
| **POLICY RATE** | 3.75% (z −0.81) | FEDFUNDS | % | Rata-rata *bulanan* Fed funds efektif → telat sebulan dari keputusan Fed |
| **GDP GROWTH** | +2.20% (z −0.33) | A191RL1Q225SBEA | % (kuartalan, disetahunkan) | Pertumbuhan ekonomi riil |
| **INFLATION** | 2.57% (z −0.93) | CPILFESL, `units=pc1` | % per tahun | Inflasi inti (tanpa makanan & energi) |

EU: CPI = HICP (indeks), rate = ECB deposit rate, growth & inflation = % y/y.

**z-score** = `(nilai terakhir − rata-rata 24 observasi terakhir) ÷ simpangan baku`. Bar
"Z-SCORE VS TRAILING NORM (±3σ)" menggambarkannya. Contoh: inflasi z −0.93 = inflasi sedikit di
bawah rata-ratanya 2 tahun terakhir.

## 2.2 REGIME — `/macro/regime?country=US`

### Panel MACRO REGIME + COMPOSITE IMPULSE + REGIME QUADRANT

Posisi negara di bidang **z pertumbuhan (sumbu X) × z inflasi (sumbu Y)**:

| | z inflasi < 0 | z inflasi ≥ 0 |
|---|---|---|
| **z pertumbuhan ≥ 0** | GOLDILOCKS | REFLATION |
| **z pertumbuhan < 0** | DEFLATION | STAGFLATION |

`COMPOSITE IMPULSE = (z pertumbuhan − z inflasi) ÷ 2` — positif = kondisi lebih ramah aset berisiko.

**Contoh 17 Okt (US):** z pertumbuhan −0.33, z inflasi −0.93 → **DEFLATION**, impulse **+0.30**.

⚠️ **Penting untuk pemula:** "DEFLATION" di sini **bukan** berarti harga turun. Artinya pertumbuhan
**dan** inflasi sama-sama **di bawah rata-rata 2 tahun terakhirnya**. Inflasi US 2.57% masih
positif. Label ini menggambarkan arah relatif, bukan kondisi absolut.

## 2.3 MARKETS — `/macro/markets`

Sumber: **Yahoo Finance** (tanpa key), data harian 1 tahun.

### Panel Z-SCORE STRIP

| Pasar | Contoh | Simbol | z vs 1 tahun |
|---|---|---|---|
| DOLLAR INDEX | 101.78 | DX-Y.NYB | +1.94σ |
| S&P 500 | 7,659 | ^GSPC | +1.22σ |
| VIX | 19.99 | ^VIX | +0.59σ |
| GOLD | 4,181 | GC=F | −0.84σ |
| US 10Y | 5.10% | ^TNX | +2.05σ (ekstrem untuk tahun ini) |

### Panel GLOBAL MARKETS (tabel)

Kolom: LEVEL, **1D**, 5D, 30D (perubahan %), **CORR** (korelasi 30 hari dengan BTC), Z 1Y.
⚠️ Kolom **1D salah**: dihitung terhadap harga penutupan sebelum awal grafik (±1 tahun lalu),
jadi "S&P 500 +15.54% 1D" sebenarnya ±perubahan setahun.

### Panel 30D CORRELATION vs BTC

Korelasi return harian 30 sesi terakhir terhadap BTC, **dicocokkan per tanggal** (saham libur
akhir pekan, BTC tidak). Contoh: emas −0.34, dolar +0.21, S&P +0.19, 10Y −0.02, VIX −0.02.
Nilai mendekati 0 = tidak searah; +1 = selalu searah; −1 = selalu berlawanan.

**Perlu untuk pemula?** Sedang — dolar dan S&P 500 adalah konteks yang mudah dipahami; korelasi
dan z-score perlu penjelasan.

---

# Masalah yang ditemukan (17 Okt 2026)

Ditemukan saat menyusun dokumen ini. **Belum diperbaiki.**

| # | Halaman | Masalah | Dampak | Perbaikan yang diusulkan |
|---|---|---|---|---|
| 1 | Derivatives, Positioning, harga Coinbase | API bursa diblokir ISP; Next.js terus menyajikan respons cache lama **tanpa badge MOCK** | Data lama terlihat live | Deteksi umur data dari timestamp sumber; lewat batas → MOCK / badge STALE |
| 2 | Macro → Markets | Kolom **1D** memakai `chartPreviousClose` (penutupan sebelum awal grafik 1 tahun) | 1D menampilkan perubahan ±1 tahun | Pakai penutupan hari sebelumnya |
| 3 | Supply | `/q/hashrate` blockchain.info 404; tampil 560.77 EH/s (Network: 1,055.6) | Angka salah | Pakai sumber hashrate yang sama dengan Network |
| 4 | Positioning → Taker Flow | Volume Binance dalam **BTC** ditampilkan dengan "$" | Satuan salah | Tampilkan "BTC" |
| 5 | Flows | Netflow dari 40 transfer terakhir (±27 hari), bukan jendela tetap | Sulit dibandingkan | Jendela tetap (mis. 7 hari) dan tampilkan rentangnya |
| 6 | Supply, Network | Label "paid provider" dan "blockchair aggregate"/"MEMPOOL SPACE" tidak sesuai sumber | Menyesatkan | Perbaiki teks |
| 7 | Network → Mempool | "CONGESTED" hanya dari ukuran antrean, tidak melihat fee | Sebutan berlebihan saat fee 1 sat/vB | Pertimbangkan fee dalam tingkat |
| 8 | Derivatives | DVOL kosong tanpa badge; "0s ago" = waktu render | Menyesatkan | Badge per panel; pakai waktu data |
