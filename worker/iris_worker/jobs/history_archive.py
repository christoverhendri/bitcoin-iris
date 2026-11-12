"""
iris_worker.jobs.history_archive
================================
Pemicu untuk route Next.js `/api/ingest/history`, yang mengarsipkan skor sentimen
berita, snapshot harian (ETF flow, derivatives, positioning, fear & greed,
confluence) dan candle OHLCV ke Supabase. Seperti whale_ingest, worker hanya
penjadwal; route-nya yang menulis.

    python -m iris_worker.jobs.history_archive
"""
import sys

import requests

from iris_worker import config


def is_configured() -> bool:
    return bool(config.IRIS_APP_URL and config.CRON_SECRET)


def run_history_archive() -> dict:
    if not is_configured():
        raise RuntimeError("IRIS_APP_URL dan CRON_SECRET harus di-set untuk memicu history archive")
    url = f"{config.IRIS_APP_URL.rstrip('/')}/api/ingest/history"
    r = requests.post(url, headers={"authorization": f"Bearer {config.CRON_SECRET}"}, timeout=180)
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:300]}
    if not r.ok:
        raise RuntimeError(f"history archive {r.status_code}: {body}")
    print(f"history archive ok: {body}")
    return body


def main():
    try:
        run_history_archive()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
