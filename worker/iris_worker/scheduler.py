"""
iris_worker.scheduler
=====================
Daemon APScheduler untuk semua job worker (semua jadwal dalam UTC):

| Job          | Env cron      | Default        | WIB              | Isi |
|--------------|---------------|----------------|------------------|-----|
| refresh_data | REFRESH_CRON  | 15 0 * * *     | tiap hari 07:15  | tarik ulang Yahoo, blockchain.com, bitcoin-data, alternative.me, FRED, CoinGecko, Google Trends -> data/clf |
| clf_weekly   | CLF_CRON      | 30 0 * * 1     | Senin 07:30      | refresh (kalau belum segar) lalu prediksi -> clf_signals / out/ |
| social_sentiment | SOCIAL_CRON | 20 0 * * *   | tiap hari 07:20  | proporsi sentimen sosial BTC dari Santiment -> social_sentiment_daily / out/ (hanya kalau SANTIMENT_API_KEY di-set) |
| whale_ingest | WHALE_CRON    | */5 * * * *    | tiap 5 menit     | POST {IRIS_APP_URL}/api/ingest/whale (hanya kalau IRIS_APP_URL + CRON_SECRET di-set) |
| watcher_news | WATCHER_CRON  | * * * * *      | tiap menit       | Telegram Watcher.Guru -> news_pipeline (SQLite) -> .data/watcher-guru.json untuk dashboard |

Catch-up saat start (bisa dimatikan dengan --no-catch-up): laptop yang mati pada
jam jadwal tidak boleh membuat data tertinggal, jadi saat daemon menyala ia
menjalankan refresh kalau data belum memuat candle kemarin, clf_weekly kalau
belum ada sinyal untuk minggu berjalan, dan social_sentiment kalau belum diambil hari ini.

Penggunaan CLI:
    python -m iris_worker.scheduler                   # daemon
    python -m iris_worker.scheduler --once all        # refresh + weekly sekali lalu keluar
    python -m iris_worker.scheduler --once refresh|weekly|social|whale|watcher
"""
import argparse
import json
import sys
import traceback
from datetime import datetime, timedelta, timezone

import pandas as pd
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from iris_worker import config
from iris_worker.data.build import last_closed_day, week_start_sunday
from iris_worker.jobs import whale_ingest
from iris_worker.jobs.clf_weekly import WeekNotClosedError, run_clf_weekly
from iris_worker.jobs.refresh_data import run_refresh
from iris_worker.jobs.social_sentiment import run_social_sentiment
from iris_worker.jobs.watcher_news import run_watcher_news


def parse_cron(cron_expr: str) -> CronTrigger:
    """Mengubah format 5-field cron standar ke APScheduler CronTrigger (zona UTC)."""
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        raise ValueError(
            f"Format cron tidak valid: '{cron_expr}'. Diharapkan 5 bagian (menit jam tgl_bln bln hr_dlm_mggu)."
        )
    minute, hour, day, month, day_of_week = parts
    # Cron standar: 0/7 = Minggu, 1 = Senin. APScheduler: 0 = Senin. Pakai nama hari
    # supaya tidak ada salah tafsir.
    names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    if day_of_week != "*":
        day_of_week = ",".join(
            "-".join(names[int(x)] if x.isdigit() else x for x in part.split("-"))
            for part in day_of_week.split(",")
        )
    return CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone="UTC",
    )


# ----------------------------------------------------------------------------
# Kondisi kesegaran untuk catch-up
# ----------------------------------------------------------------------------
def data_as_of():
    p = config.CLF_DATA_DIR / "refresh_report.json"
    if not p.exists():
        return None
    try:
        return pd.Timestamp(json.loads(p.read_text(encoding="utf-8"))["as_of"])
    except (ValueError, KeyError):
        return None


def data_is_fresh(now=None) -> bool:
    a = data_as_of()
    return a is not None and a >= last_closed_day(now)


def last_signal_as_of():
    p = config.CLF_SIGNAL_OUT
    if not p.exists():
        return None
    try:
        return pd.Timestamp(json.loads(p.read_text(encoding="utf-8"))["as_of"])
    except (ValueError, KeyError):
        return None


def weekly_is_current(now=None) -> bool:
    a = last_signal_as_of()
    return a is not None and a >= week_start_sunday(now)


def social_fetched_today(now=None) -> bool:
    """Sudah diambil hari ini (UTC)? Santiment sendiri tertunda, jadi yang dicek tanggal fetch."""
    p = config.SOCIAL_SENTIMENT_OUT
    if not p.exists():
        return False
    try:
        fetched = pd.Timestamp(json.loads(p.read_text(encoding="utf-8"))["fetched_utc"])
    except (ValueError, KeyError):
        return False
    now = now if now is not None else pd.Timestamp.now(tz="UTC")
    return fetched.tz_convert("UTC").normalize() >= now.tz_convert("UTC").normalize()


# ----------------------------------------------------------------------------
# Job
# ----------------------------------------------------------------------------
def _stamp(msg):
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


# Tepat setelah 00:00 UTC Yahoo sering belum memfinalkan candle kemarin. Job yang
# datanya belum lengkap dijadwalkan ulang sendiri tiap RETRY_MINUTES, maks. MAX_RETRIES.
RETRY_MINUTES = 60
MAX_RETRIES = 12
_SCHED = None


def _retry(fn, job_id: str, attempt: int, **kwargs) -> None:
    if _SCHED is None or attempt >= MAX_RETRIES:
        _stamp(f"{job_id}: tidak dicoba ulang lagi (percobaan {attempt + 1}/{MAX_RETRIES + 1})")
        return
    when = datetime.now(timezone.utc) + timedelta(minutes=RETRY_MINUTES)
    _SCHED.add_job(fn, "date", run_date=when, id=f"{job_id}_retry", replace_existing=True,
                   kwargs={**kwargs, "attempt": attempt + 1})
    _stamp(f"{job_id}: dicoba ulang {when.isoformat(timespec='minutes')} (percobaan {attempt + 2})")


def job_refresh(attempt: int = 0):
    _stamp("refresh_data mulai")
    try:
        run_refresh()
    except Exception as e:
        _stamp(f"refresh_data GAGAL: {e}")
        traceback.print_exc()
    if not data_is_fresh():
        _stamp(f"refresh_data: candle {last_closed_day().date()} belum tersedia (as_of={data_as_of()})")
        _retry(job_refresh, "refresh_data", attempt)


def job_weekly(dry_run: bool = False, attempt: int = 0):
    _stamp("clf_weekly mulai")
    try:
        if not data_is_fresh():
            run_refresh()
        run_clf_weekly(dry_run=dry_run, require_as_of=week_start_sunday().date())
    except WeekNotClosedError as e:
        _stamp(f"clf_weekly ditunda: {e}")
        _retry(job_weekly, "clf_weekly", attempt, dry_run=dry_run)
    except Exception as e:
        _stamp(f"clf_weekly GAGAL: {e}")
        traceback.print_exc()


def job_social():
    _stamp("social_sentiment mulai")
    try:
        run_social_sentiment()
    except Exception as e:
        _stamp(f"social_sentiment GAGAL: {e}")
        traceback.print_exc()


def job_whale():
    try:
        whale_ingest.run_whale_ingest()
    except Exception as e:
        _stamp(f"whale_ingest GAGAL: {e}")


def job_watcher():
    # Quiet on success (runs every minute); the pipeline's own back-off handles
    # repeated failures, so a failure is logged once per attempt and skipped.
    try:
        run_watcher_news()
    except Exception as e:
        _stamp(f"watcher_news GAGAL: {e}")


def catch_up(dry_run: bool = False):
    if not data_is_fresh():
        _stamp(f"catch-up: data as_of={data_as_of()} < {last_closed_day().date()} -> refresh")
        job_refresh()
    if not weekly_is_current():
        _stamp(f"catch-up: sinyal terakhir {last_signal_as_of()} < minggu {week_start_sunday().date()} -> clf_weekly")
        job_weekly(dry_run=dry_run)
    if config.SANTIMENT_API_KEY and not social_fetched_today():
        _stamp("catch-up: sentimen sosial belum diambil hari ini -> social_sentiment")
        job_social()


def main():
    parser = argparse.ArgumentParser(description="IRIS Worker Scheduler")
    parser.add_argument("--once", choices=["refresh", "weekly", "social", "whale", "watcher", "all"],
                        help="Jalankan job sekali lalu keluar.")
    parser.add_argument("--dry-run", action="store_true", help="clf_weekly tanpa menulis apa pun.")
    parser.add_argument("--no-catch-up", action="store_true",
                        help="Jangan jalankan job yang terlewat saat daemon start.")
    parser.add_argument("--log-file", default=None,
                        help="Tulis stdout/stderr ke file ini (untuk pythonw.exe, yang tidak punya console).")
    args = parser.parse_args()

    if args.log_file:
        log = open(args.log_file, "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = log

    if args.once:
        if args.once in ("refresh", "all"):
            run_refresh()
        if args.once in ("weekly", "all"):
            run_clf_weekly(dry_run=args.dry_run)
        if args.once == "social" or (args.once == "all" and config.SANTIMENT_API_KEY):
            run_social_sentiment(dry_run=args.dry_run)
        if args.once == "whale":
            whale_ingest.run_whale_ingest()
        if args.once == "watcher":
            print(run_watcher_news())
        return

    global _SCHED
    sched = _SCHED = BlockingScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600},
    )
    sched.add_job(job_refresh, parse_cron(config.REFRESH_CRON), id="refresh_data",
                  name="Refresh data input model")
    sched.add_job(job_weekly, parse_cron(config.CLF_CRON), id="clf_weekly",
                  name="Weekly BTC Classification", kwargs={"dry_run": args.dry_run})
    if config.SANTIMENT_API_KEY:
        sched.add_job(job_social, parse_cron(config.SOCIAL_CRON), id="social_sentiment",
                      name="Santiment social sentiment")
    else:
        _stamp("social_sentiment dilewati: SANTIMENT_API_KEY belum di-set")
    if whale_ingest.is_configured():
        sched.add_job(job_whale, parse_cron(config.WHALE_CRON), id="whale_ingest",
                      name="Whale Alert ingest trigger", misfire_grace_time=120)
    else:
        _stamp("whale_ingest dilewati: IRIS_APP_URL / CRON_SECRET belum di-set")

    sched.add_job(job_watcher, parse_cron(config.WATCHER_CRON), id="watcher_news",
                  name="Watcher.Guru news pipeline", misfire_grace_time=60)

    if not args.no_catch_up:
        catch_up(dry_run=args.dry_run)
        job_watcher()

    _stamp("Scheduler aktif (UTC):")
    for j in sched.get_jobs():
        print(f"  - {j.id:16s} {j.trigger}", flush=True)
    try:
        sched.start()
    except (KeyboardInterrupt, SystemExit):
        _stamp("Scheduler dimatikan.")


if __name__ == "__main__":
    main()
