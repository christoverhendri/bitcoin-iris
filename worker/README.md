# IRIS-Terminal Python Worker

Worker 12-factor untuk model klasifikasi arah BTC 7 hari (`clf_7d`, average ensemble
XGBoost MacroCrossAsset + Universal). Ambang dari export notebook: `meta.json`
`avg_threshold` = 0.06 → BULL kalau p_up ≥ 0.06, selain itu BEAR (`iris_clf/signal_rule.py`;
`signal_rule.json` dua ambang dipakai otomatis kalau suatu hari diekspor).

Model di `models/clf_7d/` = export notebook `btc_clf_export.zip` (2026-10-16T19:15 UTC).
`python check_parity.py --master data/seed/btc_master_2.csv --category-dir data/seed`
membuktikan kode inference = notebook (selisih maks ~3e-8).

### Mengganti model dengan export baru

1. Salin `meta.json`, `parity_check.csv`, `xgb_*.json` ke `models/clf_7d/`.
2. `python check_parity.py ...` (di atas) harus LOLOS.
3. `python -m iris_worker.track_record` → tulis ulang `track_record.json` (confidence di
   dashboard = presisi sinyal di set uji). Test `test_installed_model_artifacts_are_consistent`
   gagal kalau langkah ini terlupa.

## Alur

```
refresh_data (harian)                         clf_weekly (Senin)
  Yahoo, blockchain.com, bitcoin-data.com,      data/clf/*.csv
  alternative.me, FRED, CoinGecko,      ──▶     ──▶ predict_latest ──▶ BULL/BEAR/NONE
  Google Trends  ──▶ data/clf/*.csv                 ──▶ Supabase clf_signals (kalau dikonfigurasi)
                     data/clf/refresh_report.json   ──▶ out/clf_signal_latest.json (selalu)
```

| Kolom | Sumber | Key |
|---|---|---|
| BTC OHLCV + turunan (ema, rsi, macd, bb, atr, vol) | Yahoo BTC-USD | - |
| gold, S&P 500, Dow, minyak, ETH | Yahoo GC=F, ^GSPC, ^DJI, CL=F, ETH-USD | - |
| 16 kolom on-chain | blockchain.com charts | - |
| sopr, mvrv | bitcoin-data.com (gratis: tertunda ~7 hari) | - |
| fear & greed | alternative.me | - |
| usdt_dominance | CoinGecko `/global` (snapshot harian, disimpan di `data/state/`) | opsional |
| google_trends_bitcoin | Google Trends via pytrends, di-rescale ke seri tersimpan | - |
| CPI, PCE, PPI, NFP, UNRATE, AHE, retail, GDP, FOMC, dollar index, M2 | FRED (release lag diterapkan) | **FRED_API_KEY** |

Pemetaan & rumus dicocokkan ke CSV training: pada periode overlap 2025-06..2026-08
hampir semua kolom identik persis; selisih kecil hanya di gold/ETH/SOPR/MVRV (revisi provider).
Sumber yang gagal tidak menghentikan refresh: kolomnya dibekukan di nilai terakhir dan
tercatat `ok: false` di `refresh_report.json`.

## Jadwal (UTC)

| Job | Env | Default | WIB |
|---|---|---|---|
| `refresh_data` | `REFRESH_CRON` | `15 0 * * *` | tiap hari 07:15 |
| `clf_weekly` | `CLF_CRON` | `30 0 * * 1` | Senin 07:30 |
| `social_sentiment` | `SOCIAL_CRON` | `20 0 * * *` | tiap hari 07:20 (butuh `SANTIMENT_API_KEY`) |
| `whale_ingest` | `WHALE_CRON` | `*/5 * * * *` | tiap 5 menit (butuh `IRIS_APP_URL` + `CRON_SECRET`) |
| `watcher_news` | `WATCHER_CRON` | `* * * * *` | tiap menit: Telegram Watcher Guru → `news_pipeline` → `.data/watcher-guru.json` |

Cron memakai konvensi standar (1 = Senin, 0/7 = Minggu). Saat daemon start, job yang
terlewat (laptop mati) langsung dikejar.

## Menjalankan

```bash
cd worker
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
cp env.example .env                                        # isi FRED_API_KEY dll.

python -m iris_worker.scheduler                  # daemon
python -m iris_worker.scheduler --once all       # refresh + prediksi sekali
python -m iris_worker.jobs.refresh_data          # refresh saja
python -m iris_worker.jobs.clf_weekly --dry-run  # prediksi, cetak JSON, tanpa menulis
python -m pytest -q
```

Otomatis saat login Windows: `powershell -ExecutionPolicy Bypass -File scripts\install_task.ps1`.
Produksi: `.github/workflows/model-worker.yml` (GitHub Actions, secrets `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `FRED_API_KEY`).

Dashboard lokal tanpa Supabase: set `CLF_LOCAL_SIGNAL_FILE=worker/out/clf_signal_latest.json`
di `.env.local` root; panel Weekly membaca file itu.
