# Bitcoin IRIS

Repositori riset forecasting Bitcoin dan **IRIS BTC Intelligence Terminal**.

## Status integrasi

- `terminal/`: aplikasi Next.js, React, dan TypeScript untuk harga, indikator, berita, sentiment, on-chain, makro, dan forecast.
- `news_pipeline/`: pipeline Python Watcher.Guru, parser, penyimpanan, dan modelling. Proyeksi SQLite v2 membawa semantic events, evidence, review flags, dan ranking weight ke NEWS; model prediksi Python belum terhubung. RSS tetap memakai aturan headline terminal.
- `bitcoin iris/`: dataset, baseline Python, notebook, dan laporan riset.
- **Model XGBoost riset belum terhubung ke terminal.** Forecast bulanan memakai bootstrap secara default; `IRIS_FORECAST_PATH` mengaktifkan adapter artifact tervalidasi. Artifact research-only ditolak.
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

## Free research data foundation

`market_data/` collects Coin Metrics **Community** Bitcoin on-chain metrics without a paid key, stores immutable CSV + SHA-256 provenance, and imports validated observations into an append-only local SQLite store. Missing values stay missing; as-of queries cannot use measurements that were not observed at the forecast origin. This is for **noncommercial research**, not automatically deployed forecasting. See [free data sources, setup and limitations](docs/free_data_sources.md). Planned expansion, provider rights, archive freshness, **independent Bitcoin block/transaction/UTXO analysis** and point-in-time safeguards are documented in the [on-chain data specification](docs/onchain_data_specification.md) and [transaction research issue #11](https://github.com/christoverhendri/bitcoin-iris/issues/11).

### Optional research warehouse

`market_data/warehouse.py` converts canonical SQLite on-chain revisions and verified Coinbase CSV snapshots into immutable ZSTD Parquet read-models. The optional `requirements-warehouse.txt` installs DuckDB for local analytics; terminal startup and ordinary ingestion remain unchanged. Existing Python forecasting and diagnostics accept verified `prices.parquet` through `--prices` with the same training/evaluation restrictions. See [warehouse setup, quality gates and integration tests](docs/warehouse.md).

## Data Quality Gate and storage benchmarks

`market_data.quality` validates hash-bound Coinbase OHLCV and canonical on-chain
SQLite observations, reports missingness/revisions/freshness, and cross-checks
separately sourced daily market candles. It emits new-only `data_quality_report.json`
and exits nonzero for a failing operational gate. The existing legacy dataset
is always labelled **research_only**. Parquet forecasting now requires a passing
quality report bound to the exact file bytes; it still cannot become a validated
market forecast automatically.

`market_data.benchmark` compares equivalent SQLite and DuckDB/Parquet as-of read
workloads, refuses data disagreement, and publishes measured timings without
claiming one engine is always faster. See [M1 Trusted Data guide](docs/data_quality.md).
CI also inventories the checked-in historical BTC CSV as a downloadable,
non-gating research-only artifact. No collector is scheduled and no paid API added.

## Keyless hourly BTC/USD history

The separate `market_data.hourly_prices` collector downloads Coinbase Exchange
**1-hour** BTC/USD candles in bounded, resumable 240-hour windows, preserving
source revisions and last-seen evidence in SQLite. It excludes unfinished
hours, records gaps rather than filling them, and exports verified, immutable
hourly Parquet for DuckDB. Complete 24-hour sets can be aggregated to
Coinbase-derived **daily research** artifacts for the existing quality-gated
forecast pipeline; no live terminal collector or new paid service is activated.
An optional, non-gating GitHub Actions workflow probes real Coinbase API
responses and can produce a temporary full backfill artifact.
See [hourly backfill and verification guide](docs/hourly_backfill.md).

## Minute-level trading activity research

`market_data/minute_activity.py` provides opt-in, keyless 1-minute Coinbase
BTC/USD ingestion, append-only source revisions, bounded SQLite checkpoints,
and conservative cross-resolution activity reconciliation. Missing minutes are
`UNKNOWN` unless independently fetched 1-hour Coinbase OHLCV supports an
`INFERRED_NO_TRADE` classification; this is not tick-ledger proof.
Raw missing OHLC stays null, and inferred zero volume is explicitly labeled.
Research-grade Parquet export and `market_data.quality minute` are available;
no full-history minute crawl, live terminal replacement or model promotion is
automatic. See [minute activity guide](docs/minute_activity.md) and
[implementation issue #6](https://github.com/christoverhendri/bitcoin-iris/issues/6).

## ETF daily inflow/outflow (free-source research)

The optional `market_data.etf_flows` module imports the publicly visible
Farside Investors US spot Bitcoin ETF per-fund historical table (USD millions),
with an **explicit opt-in single HTTP fetch** or a saved HTML import when
access is restricted. Canonical SQLite retains revisions, observed timestamps,
source hashes and as-of history; the read-model exports immutable daily totals
and fund-level Parquet with a distinct `market_data.quality etf` gate.
A printed `-` stays **NULL**, not zero; holidays/all-unreported rows are never
treated as traded zero-flow observations. Farside public visibility does not
establish scraping/redistribution rights, historical release timestamps, or
forecast-model approval. No paid ETF API or background worker is started.
See [ETF collection and rights guide](docs/etf_flows.md) and
[tracking issue #9](https://github.com/christoverhendri/bitcoin-iris/issues/9).

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

- [Spesifikasi sistem pasar dan keputusan integrasi Quant Iris](docs/market_system_specification.md)
- [Menjalankan pipeline forecast dan adapter terminal](docs/forecast_pipeline.md)
- [Panduan teknis terminal](terminal/README.md)
- [Integrasi semantic parser Watcher.Guru](terminal/docs/WATCHER_GURU_TEST.md)
- [Integrasi dan batas operasional](docs/integration.md)
- [Arsip audit berita 2026-09-06](terminal/docs/archive/2026-09-08/NEWS_SOURCE_AUDIT.md)
- [Token desain](terminal/docs/DESIGN_TOKENS.md)
- [Dataset](bitcoin%20iris/dataset/README.md)
- [Laporan forecasting bulanan](bitcoin%20iris/STATUS_REPORT_monthly_forecasting.md)
- [Laporan validasi](bitcoin%20iris/validation_report.md)

Laporan riset mencatat hasil pada saat dibuat, bukan validasi runtime web terkini.
Terminal diimpor dari [Programmer7177/IRIS-Terminal](https://github.com/Programmer7177/IRIS-Terminal).
Revision asal tercatat dalam catatan integrasi.
