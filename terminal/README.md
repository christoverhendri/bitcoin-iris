# IRIS BTC Intelligence Terminal

Aplikasi Next.js/React/TypeScript untuk data Bitcoin.
Instalasi, mode development/production, dan struktur repositori dijelaskan di
[README root](../README.md). Gunakan perintah root untuk binding localhost.

## Struktur source

| Path | Tanggung jawab |
| --- | --- |
| `src/app/(terminal)/` | Halaman terminal |
| `src/app/api/` | Endpoint data, SSE, health, dan ingestion opsional |
| `src/components/shell/` | Sidebar, topbar, navigasi, timeframe, command palette |
| `src/components/primitives/` | Panel, loading, badge, dan sumber data |
| `src/components/features/` | Tampilan khusus berita, sentiment, whale, dan fitur lainnya |
| `src/components/charts/` | Visualisasi chart |
| `src/lib/features/` | Kontrak dan transformasi data tiap fitur |
| `src/lib/sources/` | Adapter provider, HTTP/RSS, dan arsip berita |
| `src/lib/onchain/` | Pengolahan dan klasifikasi on-chain |
| `src/lib/geo/` | Klasifikasi/pemetaan event geografis |
| `src/lib/theme/` | Token tampilan |
| `src/lib/newsHub.ts` | Berbagi pembaruan berita antar subscriber SSE |
| `public/brand/` | Logo terminal |
| `supabase/` | Migrasi database opsional |
| `.data/news/` | Arsip dan checkpoint lokal, bukan source code |

Tes `*.test.ts` dan `*.test.tsx` berada dekat modul yang diuji.

## Kontrak data

Fitur umumnya memisahkan `types.ts` (bentuk data), `live.ts` (pengambilan data),
`mock.ts` (contoh), dan `present.ts` (format/presentasi).
`Envelope<T>` membawa status sumber dan timestamp bersama payload.
`defineFeature.ts` menangani live/fallback; beberapa fitur memiliki aturan tambahan.

Berita tidak menghasilkan headline contoh. Whale events sintetis disaring dari
respons production; panel dan ringkasan menampilkan unavailable.
Fitur lain tetap harus menunjukkan MOCK jika memakai data contoh.

Komponen client mengimpor helper dari `present.ts` dan tipe melalui
`import type`, agar modul server seperti filesystem tidak masuk bundle browser.

## Endpoint utama

| Endpoint | Kegunaan |
| --- | --- |
| `GET /api/news` | Maksimal 400 headline; nextCursor untuk halaman berikutnya |
| `GET /api/news?cursor=...` | Riwayat lebih lama; URL-encode cursor dari server |
| `GET /api/news/stream` | SSE snapshot berita dengan heartbeat dan reconnect |
| `GET /api/whale` | Membaca Whale Wire; sumber kosong bukan transaksi bernilai nol |
| `GET /api/health` | Diagnostik aplikasi/sumber |

Jumlah feed terkonfigurasi tidak membuktikan semua provider berhasil merespons.
Supabase tidak diperlukan untuk startup, tetapi fitur berbasis database tetap
memerlukan konfigurasi dan ingestion.

## Batas integrasi

Forecast terminal belum memakai XGBoost dari folder riset Python.
Arsip lokal membutuhkan filesystem persisten dan ditujukan untuk satu proses
server, bukan koordinasi lintas instance serverless.

- [Integrasi, provenance, dan batas operasional](../docs/integration.md)
- [Arsip audit berita 2026-09-06](docs/archive/2026-09-08/NEWS_SOURCE_AUDIT.md)
- [Token desain](docs/DESIGN_TOKENS.md)

Dokumen arsitektur, manifest, dan status upstream lama disimpan dalam `docs/archive/2026-09-08/`; dokumen tersebut bukan status operasional saat ini.
