"""
iris_worker.jobs.social_sentiment
=================================
Job harian: ambil proporsi sentimen sosial BTC (positif / netral / negatif) dari
Santiment, simpan ke out/social_sentiment.json (dibaca dashboard lokal lewat
SOCIAL_SENTIMENT_LOCAL_FILE) dan upsert ke Supabase `social_sentiment_daily`
kalau kredensialnya ada.

    python -m iris_worker.jobs.social_sentiment [--dry-run]

Idempoten: kunci Supabase (date, slug); file JSON ditulis ulang utuh tiap run.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from iris_worker import config, status
from iris_worker.data import santiment
from iris_worker.supabase_rest import upsert_rows


def build_payload(rows, rejected, restricted_to, keep: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    if not rows:
        raise RuntimeError("Santiment tidak mengembalikan satu pun hari yang lengkap")
    now = now or datetime.now(timezone.utc)
    return {
        "slug": santiment.SLUG,
        "provider": "santiment",
        "metrics": list(santiment.METRICS.values()),
        "sources": santiment.SOURCES,
        "fetched_utc": now.isoformat(timespec="seconds"),
        # Batas akun: data setelah tanggal ini disembunyikan oleh Santiment.
        "restricted_to": restricted_to,
        "rejected_dates": rejected,
        "rows": rows[-keep:],
    }


def run_social_sentiment(dry_run: bool = False, out_file: Optional[Path] = None) -> Dict[str, Any]:
    data = santiment.fetch_raw(config.SANTIMENT_API_KEY, days=config.SOCIAL_SENTIMENT_DAYS + 40)
    rows, rejected, restricted_to = santiment.to_rows(data)
    payload = build_payload(rows, rejected, restricted_to, config.SOCIAL_SENTIMENT_DAYS)
    last = payload["rows"][-1]
    print(
        f"Santiment: {len(payload['rows'])} hari, terbaru {last['date']} "
        f"(+{last['positive']:.1%} / ={last['neutral']:.1%} / -{last['negative']:.1%})"
        + (f", ditolak: {rejected}" if rejected else "")
    )
    if dry_run:
        print(json.dumps(payload, indent=2))
        return payload

    out = Path(out_file) if out_file else Path(config.SOCIAL_SENTIMENT_OUT)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY:
        n = upsert_rows(
            config.SUPABASE_URL,
            config.SUPABASE_SERVICE_ROLE_KEY,
            "social_sentiment_daily",
            [
                {
                    "date": r["date"],
                    "slug": santiment.SLUG,
                    "positive_ratio": r["positive"],
                    "neutral_ratio": r["neutral"],
                    "negative_ratio": r["negative"],
                    "fetched_at": payload["fetched_utc"],
                    "is_synthetic": False,
                }
                for r in payload["rows"]
            ],
            on_conflict="date,slug",
        )
        print(f"Upsert social_sentiment_daily: {n} baris")
        status.report_success("santiment", n=n)
    else:
        print(f"Supabase belum dikonfigurasi - hanya ditulis ke {out}")
    return payload


def main():
    ap = argparse.ArgumentParser(description="Sentimen sosial BTC harian dari Santiment")
    ap.add_argument("--dry-run", action="store_true", help="Cetak JSON saja, tanpa menulis apa pun.")
    a = ap.parse_args()
    try:
        run_social_sentiment(dry_run=a.dry_run)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
