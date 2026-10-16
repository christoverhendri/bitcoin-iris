# IRIS-Terminal Python Worker

Worker Python 12-factor untuk inferensi model klasifikasi Bitcoin 7 hari (`clf_weekly`).

## Cara Menjalankan

### 1. Eksekusi Mandiri (Cron VPS / Windows Task Scheduler / External Scheduler)
Job dapat dipanggil langsung tanpa daemon scheduler:
```bash
python -m iris_worker.jobs.clf_weekly [--dry-run]
```

### 2. APScheduler Daemon
Scheduler bawaan yang berjalan terus di background sesuai jadwal `CLF_CRON` (default: `30 0 * * 1` = Senin 00:30 UTC):
```bash
python -m iris_worker.scheduler
```
Atau jalankan sekali lalu keluar:
```bash
python -m iris_worker.scheduler --once
```

## Konfigurasi Environment (12-Factor)
Lihat `env.example`. Pengaturan diisi via file `worker/.env` atau environment variable sistem:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLF_DATA_DIR` (default: `worker/data/clf`)
- `CLF_MODEL_DIR` (default: `worker/models/clf_7d`)
- `CLF_MAX_DATA_LAG_DAYS` (default: `3`)
- `CLF_MAX_NAN` (default: `0`)
- `CLF_CRON` (default: `30 0 * * 1`)
