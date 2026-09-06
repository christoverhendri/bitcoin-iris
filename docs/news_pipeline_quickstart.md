# Pipeline news Python

Annotation-free market modelling is now available: frozen embeddings, training-only
clustering/PCA, parser features, and automatically generated return/volatility
targets. See [setup, experiments and verified results](annotation_free_modelling.md).
It uses a separate optional `requirements-model.txt` environment.

Eksperimen forecasting ada di `bitcoin iris/`. Pipeline modelling news ada di
`news_pipeline/`; requirements root khusus pipeline news.

For the **durable parser-only data pipeline**, use `python -m news_pipeline data run`.
It saves raw data before parsing, resumes catch-up, quarantines invalid records,
and computes explainable post weights without loading a sentiment model.
See [data pipeline commands and weighting](data_pipeline.md) and
[abuse review and validation](pipeline_security_review.md). The older commands
below are the optional sentiment baseline workflow.

## Menjalankan

Python 3.11+, dari root repository (PowerShell):

```powershell
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv/Scripts/python.exe -m news_pipeline train
.venv/Scripts/python.exe -m news_pipeline predict --text "Bitcoin falls after exchange hack"
.venv/Scripts/python.exe -m news_pipeline poll
.venv/Scripts/python.exe -m news_pipeline export
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Tanpa uv: `python -m venv .venv`, kemudian
`.venv/Scripts/python.exe -m pip install -r requirements.txt`.
Polling terus-menerus, hentikan dengan Ctrl+C:

```powershell
.venv/Scripts/python.exe -m news_pipeline poll --watch --interval 60
```

## Sumber dan preprocessing

Data repo berasal dari **Telegram Watcher.Guru**, bukan Twitter/X. Histori:
`bitcoin iris/dataset/kategori/textual_news/watcher_guru_articles.jsonl`.
Live fetch: GET https://t.me/s/WatcherGuru, parser container
`.tgme_widget_message[data-post]`, teks `.tgme_widget_message_text`, timestamp
`time[datetime]`. Public preview HTML ini tidak membutuhkan token; bukan streaming
API resmi. Perubahan layout/halaman tanpa teks memunculkan error eksplisit.
Fetch kini memakai timeout koneksi/read 10/15 detik, batas body 2 MiB, dan menolak
redirect. Mode watch mencoba lagi pada siklus berikutnya.

Alur: raw post → simpan provenance → hapus URL, mention, prefix alert, rapikan
whitespace → TF-IDF → classifier → SQLite. Media tanpa teks dilewati.
`published_at` kosong tetap null; `observed_at` mencatat waktu versi post ditemukan.
Mode watch mencatat kegagalan lalu mencoba kembali pada interval berikutnya.

Polling hanya membaca halaman terbaru: belum ada pagination historis atau catch-up
setelah downtime panjang. Poll pertama memproses semua post yang terlihat.
Ini prototipe near-real-time tanpa jaminan kelengkapan seluruh post; tidak ada
service background yang otomatis dipasang.

## Modelling dan evaluasi

Parser news terbaru tersedia melalui `python -m news_pipeline parse`; output live
sekarang menyertakan `semantic_parse` dengan evidence offsets, entity mentions,
quantities, event triggers, negation dan modality. Tidak memerlukan model neural
tambahan. Panduan, contoh, dan batas coverage: [news parser](news_parser.md).

TF-IDF unigram/bigram + Logistic Regression berbobot kelas. Target
negative/neutral/positive berasal dari tanda `assessment.result.sentiment.polarity`.
Ini **weak labels heuristik**, bukan anotasi manusia. Evaluasi mengukur agreement
dengan teacher, bukan akurasi sentimen manusia atau prediksi dampak harga BTC.

Training membuang timestamp invalid/kosong, teks kosong, label hilang, duplikat
teks ternormalisasi, dan versi berulang source_id. Versi pertama dalam urutan
tanggal dipertahankan; histori backfill tidak menjamin teks itu merupakan versi
yang tersedia pada waktu publikasi awal. Kemiripan event/parafrasa belum dideteksi.
Fitur hanya teks, tidak memasukkan assessment score, URL, atau metadata sumber.

Split kronologis menurut hari UTC: 70% hari awal train, 15% validation, 15% test.
Satu hari tidak terpecah antarpartisi. TF-IDF hanya fit di train. Pilih C dari
0.5/2/8 berdasarkan validation Macro-F1; test dievaluasi setelah pemilihan.
Model tersimpan tetap model train, tidak refit pada test. Laporan mencakup baseline
kelas mayoritas, metrik tiap kelas, distribusi label, dan batas waktu split.

`explicit_btc_mention` hanya deteksi keyword Bitcoin/BTC, bukan model relevansi;
berita makro tanpa keyword bisa relevan. Probabilitas belum dikalibrasi.
`needs_review` memakai threshold operasional 0.6 yang belum divalidasi manusia.

## Output dan integrasi

Output lokal berikut diabaikan Git:

- `artifacts/news/model.joblib`: preprocessing, classifier, model_id.
- `artifacts/news/evaluation.json`: audit, split, pemilihan model, metrik.
- `artifacts/news/test_predictions.csv`: prediksi held-out untuk review.
- `artifacts/news/live.sqlite`: tabel predictions, payload JSON per versi post.
- `artifacts/news/live_predictions.jsonl`: hasil perintah export.

Payload memuat raw/cleaned text, semantic_parse, URL/id, published_at, observed_at, sentiment,
probabilities, needs_review, explicit_btc_mention, model_id, classified_at.
Prototipe dapat membaca SQLite atau JSONL. Kunci source + source_id + content_hash
mencegah duplikasi saat restart; hash versi baru memakai raw_text. Edit teks disimpan
sebagai versi baru. Parser lama dapat diperbarui saat post ditemukan kembali.
Batch memakai transaksi sehingga kegagalan tidak meninggalkan separuh batch.
Gunakan satu writer. Retraining tidak menimpa prediksi tersimpan: gunakan database
baru untuk eksperimen model lain. Hanya load joblib yang dibuat sendiri.

Untuk forecasting, artikel perlu agregasi sesuai cutoff informasi, bukan merge
per baris atau forward/backward-fill sentimen. Simulasi live harus menggunakan
observed_at dan versi yang tersedia saat itu; timestamp kosong dikeluarkan dari
agregasi historis. Jangan menggunakan classifier yang dilatih pada masa depan
untuk backtest masa lalu. Agregasi dan merge master belum menjadi output pipeline.

## Validasi lanjutan

Siapkan anotasi manusia untuk sentimen dan relevansi BTC dengan held-out temporal.
Audit negasi, kutipan, recap multi-event, serta berita makro sebelum membandingkan
model bahasa dengan baseline ini. Fetch satu kali tidak membuktikan reliabilitas
polling jangka panjang.

Referensi: [TF-IDF](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html),
[Logistic Regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html),
[sumber live](https://t.me/s/WatcherGuru).
