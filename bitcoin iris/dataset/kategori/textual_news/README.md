# Textual News Dataset

Folder ini menyimpan berita/post tekstual tingkat artikel untuk eksperimen IRIS. Data di sini belum berupa fitur harian dan tidak menggantikan `kategori/sentimen.csv`.

## `watcher_guru_articles.jsonl`

- **Sumber:** histori publik Telegram Watcher.Guru, dikumpulkan melalui pipeline textual-news.
- **Granularitas:** satu record per versi post tekstual.
- **Periode:** 2022-08-23 sampai 2026-08-23.
- **Jumlah:** 9.471 record unik.
- **Parser:** `structural-rs/0.2.0`.
- **Assessment:** `importance-rs/0.1.0`.

Setiap record mempertahankan raw text dan provenance, hasil parsing struktural, serta breakdown assessment yang mencakup:

- sentiment polarity dan magnitude;
- source reliability dan confidence;
- event significance;
- temporal relevance;
- effective sentiment dan importance score;
- clickbait risk;
- state change, affected entities, dan event evidence.

## Batasan penggunaan

- Ini adalah candidate pool, bukan label kebenaran atau dataset training final.
- Hanya 2.295 record yang secara eksplisit menyebut Bitcoin/BTC. Record lain dapat berupa crypto, makro, regulasi, atau berita pasar yang masih perlu diberi label relevansi.
- Sebanyak 705 record tidak memiliki `published_at` dari Telegram public preview. Jangan memakai waktu backfill sebagai waktu kejadian.
- Source reliability saat ini menggunakan neutral prior `0.5`, bukan rating faktual atas kredibilitas setiap berita.
- Importance dan clickbait score adalah baseline heuristik yang perlu dikalibrasi dengan anotasi manusia.
- Post recap dapat memuat beberapa event dan sebaiknya dipecah sebelum pelatihan event-level.

## Hubungan dengan dataset harian

File ini tidak boleh langsung di-forward-fill, backward-fill, atau digabungkan per baris ke master time-series. Untuk modelling harian:

1. filter atau label relevansi Bitcoin;
2. gunakan `published_at` sebagai waktu ketersediaan;
3. keluarkan record tanpa timestamp dari agregasi sampai ditangani;
4. agregasikan fitur per hari tanpa memakai informasi dari masa depan;
5. simpan hasilnya sebagai `kategori/textual_news_daily.csv`;
6. validasi hasil harian sebelum membuat master dataset baru.

Canonical source URL tersedia untuk audit provenance, tetapi sebaiknya tidak dipakai sebagai fitur model.
