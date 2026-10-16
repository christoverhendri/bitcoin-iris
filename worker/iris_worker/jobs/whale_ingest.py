"""
iris_worker.jobs.whale_ingest
=============================
Pemicu untuk route Next.js `/api/ingest/whale` (Whale Alert free tier hanya
melihat ~10 menit ke belakang, jadi route itu harus dipanggil tiap 5 menit).
Worker tidak menulis whale_events sendiri — ia hanya menjadi penjadwal eksternal
yang dijelaskan di docs/ARCHITECTURE.md.

    python -m iris_worker.jobs.whale_ingest
"""
import sys

import requests

from iris_worker import config


def is_configured() -> bool:
    return bool(config.IRIS_APP_URL and config.CRON_SECRET)


def run_whale_ingest() -> dict:
    if not is_configured():
        raise RuntimeError("IRIS_APP_URL dan CRON_SECRET harus di-set untuk memicu whale ingest")
    url = f"{config.IRIS_APP_URL.rstrip('/')}/api/ingest/whale"
    r = requests.post(url, headers={"authorization": f"Bearer {config.CRON_SECRET}"}, timeout=60)
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:300]}
    if not r.ok:
        raise RuntimeError(f"whale ingest {r.status_code}: {body}")
    print(f"whale ingest ok: {body}")
    return body


def main():
    try:
        run_whale_ingest()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
