# Status pipeline news — 5 September 2026

Implementasi: baseline sentimen TF-IDF + Logistic Regression, training temporal,
fetch public Telegram Watcher.Guru, klasifikasi langsung, SQLite idempoten, export
JSONL, README, requirements, dan tes otomatis.

## Hasil run lokal

- Input: 9.471 record; 705 timestamp invalid/kosong dan 329 duplikat dikeluarkan.
- Record untuk split temporal: 8.437.
- Test Macro-F1: 0,8740; baseline kelas mayoritas: 0,3054.
- Label evaluasi berasal dari heuristik dataset, bukan anotasi manusia.
- Fetch langsung: 17 post; 17 prediksi disimpan.
- Poll ulang: 17 post; 0 insert baru, deduplikasi berfungsi.
- Empat tes otomatis lulus: split waktu, timestamp, parser/deduplikasi/edit,
  dan kegagalan layout sumber.
- Kendala CA lokal ditangani melalui truststore OS dengan verifikasi TLS aktif.

Artefak lengkap ada di `artifacts/news/` setelah training; artefak lokal diabaikan
Git. Training dan smoke test selesai, tetapi kualitas sentimen terhadap label
manusia dan reliabilitas polling jangka panjang belum divalidasi.

## Batas ruang lingkup

Sumber repo/live adalah Telegram, bukan Twitter/X. Relevansi BTC baru flag keyword.
Halaman terbaru saja dipoll; catch-up downtime panjang belum tersedia. Agregasi
fitur harian dan integrasi forecasting belum diimplementasikan. Langkah modelling
berikutnya adalah anotasi manusia dan evaluasi temporal terhadap label tersebut.
