# Watcher.Guru: integrasi semantic parser

NEWS menggabungkan RSS dengan snapshot lokal Watcher.Guru. Snapshot v2 menjalankan
`parse_news()` dan `weight_post()` milik pipeline Python. Raw text, evidence dengan
offset Unicode codepoint, review flags, parser version, dan faktor ranking weight
dipertahankan. Kategori terminal dipetakan dari jenis event, bukan pencocokan judul ulang.

Polarity `affirmed`/`negated` menyatakan assertion, bukan bullish/bearish. Karena parser
belum mengestimasi arah harga, baris semantic menampilkan `REVIEW` atau `NO DIRECTION`.
Ranking weight ditampilkan terpisah dengan waktu evaluasinya; field impact untuk baris
ini bernilai null. Weight menggunakan relevance, evidence, certainty, timestamp quality,
freshness (half-life 24 jam), dan novelty dari pipeline; bukan probabilitas atau prediksi.
Urutan NEWS tetap terbaru dahulu. Weight tidak dibandingkan dengan impact RSS.

RSS dan snapshot v1 masih memakai aturan headline terminal. Skor sentiment agregat,
Confluence, dan peta tetap memakai sumber sebelumnya. Model prediksi Python belum terhubung.

Dari root repositori, gunakan environment Python pipeline yang sudah disiapkan:

```powershell
# Import histori lokal: simpan hanya 30 hari terakhir, maksimum 2.000 post.
.venv/Scripts/python.exe -m news_pipeline.terminal_snapshot
# Ambil halaman terbaru satu kali; cooldown tersimpan lima menit antarpercobaan.
.venv/Scripts/python.exe -m news_pipeline.terminal_snapshot --live
```

File `terminal/.data/watcher-guru.json` diabaikan Git. Penulisan atomik mempertahankan
histori dan mengganti versi post dengan ID yang sama. Timestamp invalid dan post
masa depan dibuang. Snapshot dibatasi 40 MiB; record terbaru diprioritaskan. Input yang
melampaui batas parser dilewati. Jalankan satu writer. Ini alat manual, belum worker otomatis,
bridge SQLite, atau catch-up halaman historis Telegram.

Terminal membaca ulang snapshot saat mengambil NEWS, termasuk siklus SSE.
Build dan restart terminal setelah memasang perubahan kode. Pembaruan snapshot
berikutnya tidak memerlukan build ulang. Sumber baris tampil sebagai `Watcher.Guru`;
diagnostik kesehatan RSS belum mencakup sumber snapshot ini. File hilang berarti
Watcher.Guru tidak aktif; file rusak dicatat di log tanpa mematikan RSS.

`--input` menerima JSONL dengan `source_id`, `raw_text`, dan `published_at`, termasuk
ekspor `iris-parsed-post/v1`. Semantic parse dihitung ulang memakai parser terpasang
dan weight dievaluasi pada waktu ekspor snapshot; assessment impor tidak dipercaya.
Metadata observed/feature-ready, collection mode, dan content hash dipertahankan bila ada.
Snapshot v1 yang sebelumnya sudah membersihkan text tidak dapat mengembalikan raw text
asli; ekspor ulang dari sumber raw/SQLite untuk mendapatkan evidence asli lengkap.
Snapshot v2 dengan versi parser/weight atau evidence tidak valid ditolak per record,
tanpa fallback diam-diam ke aturan headline.
Untuk lokasi lain, cocokkan `--output` dengan path absolut `IRIS_WATCHER_SNAPSHOT`
pada environment server terminal. `generated_at` adalah waktu ekspor, bukan waktu
publikasi atau bukti bahwa collector terus berjalan.

Validasi dari root:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -p test_terminal_snapshot.py
npm --prefix terminal test -- --run src/lib/sources/watcherGuru.test.ts src/lib/features/news/live.test.ts
```

Fixture `terminal/src/lib/sources/fixtures/semantic-news.json` berasal dari publisher
Python. Test memeriksa negasi, uncertainty, Unicode evidence, dan pemisahan weight/impact.
