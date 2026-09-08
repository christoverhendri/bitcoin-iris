# Bitcoin IRIS

Repositori riset forecasting Bitcoin dan **IRIS BTC Intelligence Terminal**.

## Status integrasi

- `terminal/`: aplikasi Next.js, React, dan TypeScript untuk harga, indikator, berita, sentiment, on-chain, makro, dan forecast.
- `news_pipeline/`: pipeline Python Watcher.Guru, parser, penyimpanan, dan modelling. Snapshot v2 membawa semantic events, evidence, review flags, dan ranking weight ke NEWS; model prediksi Python belum terhubung. RSS tetap memakai aturan headline terminal.
- `bitcoin iris/`: dataset, baseline Python, notebook, dan laporan riset.
- **Model XGBoost riset belum terhubung ke terminal.** Forecast bulanan terminal menggunakan bootstrap Monte Carlo.
- Startup tidak memerlukan kredensial. Fitur tambahan dapat memerlukan provider, database, atau ingestion.
- Berita tidak menggunakan headline contoh. Whale Wire production menampilkan unavailable jika sumber kosong/sintetis; fitur lain dapat menggunakan placeholder berlabel MOCK.

## Menjalankan terminal

Prasyarat: **Node.js 22+**, npm, dan internet untuk sumber eksternal. Python tidak diperlukan untuk aplikasi web.
Jalankan dari root repositori:

```powershell
npm run setup
npm run build
npm start
```

Buka **http://127.0.0.1:3000**. Root launcher menggunakan localhost.
Ulangi setup jika dependensi berubah dan build ulang setelah perubahan kode.
Hentikan server di terminal dengan **Ctrl+C**.

Untuk development dengan reload otomatis:

```powershell
npm run dev
```

Jalankan salah satu mode pada port 3000. `EADDRINUSE` berarti port sedang dipakai.
Jika halaman tidak dapat diakses, pastikan proses server masih berjalan.

Untuk konfigurasi opsional, salin `terminal/.env.example` ke `terminal/.env.local` jika file tujuan belum ada.
Jangan commit kredensial. Startup tidak otomatis membuat database atau menjalankan ingestion Whale Alert.

## Struktur folder

```text
bitcoin-iris/
|-- README.md
|-- package.json               # Perintah root untuk terminal
|-- terminal/                  # Aplikasi web
|   |-- src/app/               # Halaman Next.js dan API
|   |-- src/components/        # Shell, panel fitur, primitive, chart
|   |-- src/lib/               # Adapter, fitur data, cache, arsip
|   |-- public/                # Aset statis dan logo
|   |-- docs/                  # Integrasi, desain, audit sumber
|   |-- scripts/               # Utilitas verifikasi
|   |-- supabase/              # Migrasi database opsional
|   `-- .data/                 # Arsip/log lokal, diabaikan Git
|-- news_pipeline/             # Collector, parser, storage, modelling Python
|-- tests/                     # Tes pipeline Python
|-- docs/                      # Panduan pipeline dan modelling
|-- requirements.txt           # Dependensi pipeline Python
|-- requirements-model.txt     # Dependensi modelling opsional
|-- bitcoin iris/              # Riset Python
|   |-- dataset/               # Dataset dan dokumentasi sumber
|   |-- model/src/iris_btc/     # Package Python
|   |-- model/scripts/         # Direktori script model
|   |-- model/tests/           # Direktori test model
|   |-- scripts/               # Direktori pendukung riset
|   |-- tests/                 # Direktori test riset
|   |-- *.py                   # Baseline forecasting
|   |-- *.ipynb                # Notebook eksperimen
|   `-- *.md                   # Laporan status dan validasi
|-- design/logo/               # Aset/desain logo
`-- output/logo-concepts/      # Keluaran eksplorasi logo
```

`node_modules/`, `.next/`, `.venv*`, dan `__pycache__/` adalah dependensi atau keluaran lokal.
Folder desain/output tidak dibutuhkan untuk runtime web.

## Berita dan arsip

Alur: **RSS penerbit → cache dan arsip server → SSE → browser**.
Sumber: CoinDesk, CoinTelegraph, Decrypt, dan NewsBTC; CryptoPanic tidak digunakan.
GET normal dibatasi minimal lima menit per penerbit, dengan penggabungan request,
conditional GET, backoff, dan Retry-After. SSE bukan streaming langsung dari penerbit.
Usia headline menunjukkan waktu publikasi, bukan waktu pengecekan feed.

Arsip metadata, URL, dan deskripsi singkat disimpan di `terminal/.data/news/`,
maksimal 30 hari/2.000 artikel per sumber. Checkpoint bertahan setelah restart.
Set `IRIS_NEWS_ARCHIVE_DIR` ke direktori absolut untuk lokasi penyimpanan lain.
Implementasi ini ditujukan untuk satu proses server dengan filesystem persisten.

Ingestion tidak berjalan saat aplikasi mati. Artikel yang hilang dari RSS sebelum
terekam tidak bisa dipulihkan dari arsip lokal. Backfill sitemap dan API berita
berbayar belum ditambahkan. SSE memperbarui daftar berita; skor sentiment dan
marker peta masih snapshot saat halaman dibuka. Detail feed hanya muncul di development.

## Pipeline news Python

Pipeline Watcher.Guru dijalankan terpisah dengan Python 3.11+. Lihat [setup dan baseline](docs/news_pipeline_quickstart.md), [durable data pipeline](docs/data_pipeline.md), dan [modelling annotation-free](docs/annotation_free_modelling.md). Dependensi root Python tidak diperlukan untuk terminal web.

## Pemeriksaan

```powershell
npm test
npm run lint
npm run build
```

Perintah root memeriksa terminal, bukan riset Python. Tes mencakup data, cache,
arsip, pagination, streaming, dan token desain. `npm run verify:registry` melakukan
pemeriksaan tambahan registry alamat exchange melalui provider eksternal.

## Dokumentasi

- [Panduan teknis terminal](terminal/README.md)
- [Integrasi semantic parser Watcher.Guru](terminal/docs/WATCHER_GURU_TEST.md)
- [Integrasi dan batas operasional](terminal/docs/INTEGRATION.md)
- [Audit berita](terminal/docs/NEWS_SOURCE_AUDIT.md)
- [Token desain](terminal/docs/DESIGN_TOKENS.md)
- [Dataset](bitcoin%20iris/dataset/README.md)
- [Laporan forecasting bulanan](bitcoin%20iris/STATUS_REPORT_monthly_forecasting.md)
- [Laporan validasi](bitcoin%20iris/validation_report.md)

Laporan riset mencatat hasil pada saat dibuat, bukan validasi runtime web terkini.
Terminal diimpor dari [Programmer7177/IRIS-Terminal](https://github.com/Programmer7177/IRIS-Terminal).
Revision asal tercatat dalam catatan integrasi.
