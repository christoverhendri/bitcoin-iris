# Evaluasi terhadap anotasi manusia terkunci

Gold versi 2: adjudikasi setelah audit. Prediksi tetap sama; perubahan skor berasal dari perubahan gold, bukan perbaikan model atau test blind baru.

Berita asli: 120; dinilai: 114; uncertain: 6; coverage: 95.0%.

Metrik memakai ID determinate yang sama untuk kedua model; 10 stress case terpisah.

| Model | Macro-F1 (3 kelas tetap) | Accuracy |
|---|---:|---:|
| tfidf | 0.3928 | 0.4035 |
| financial_distilroberta | 0.6318 | 0.6667 |

## Label efek BTC

Kedua classifier menghasilkan sentimen dokumen, bukan prediksi efek BTC. Akurasi/F1 efek BTC belum dapat dihitung.

| Label efek BTC | Jumlah |
|---|---:|
| not_applicable | 24 |
| negative | 21 |
| positive | 10 |
| unknown | 62 |
| neutral | 3 |

Kelas manusia tanpa support: tidak ada.

Lihat summary.json untuk precision/recall/F1 per kelas, confusion matrix, alasan uncertain, dan hasil berpasangan termasuk kedua model sama-sama salah.

error_review.csv berisi seluruh 120 berita, termasuk agreement dan uncertain. Isi error_tags/error_notes setelah label dikunci; jangan mengubah gold berdasarkan prediksi.

Sampel diseimbangkan menurut weak labels; hasil tidak mewakili prevalensi sumber. Evaluasi ini belum menguji dampak harga BTC atau manfaat parser terhadap keputusan sentimen.
