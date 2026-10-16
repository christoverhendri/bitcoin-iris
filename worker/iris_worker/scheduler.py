"""
iris_worker.scheduler
=====================
APScheduler daemon untuk menjalankan job klasifikasi mingguan (clf_weekly).
Jadwal dikendalikan oleh variabel lingkungan CLF_CRON (default: 30 0 * * 1 = Senin 00:30 UTC).

Penggunaan CLI:
    python -m iris_worker.scheduler [--once] [--dry-run]
"""
import argparse
import sys
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from iris_worker import config
from iris_worker.jobs.clf_weekly import run_clf_weekly


def parse_cron(cron_expr: str) -> CronTrigger:
    """Mengubah format 5-field cron standar ke APScheduler CronTrigger (zona UTC)."""
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        raise ValueError(
            f"Format cron tidak valid: '{cron_expr}'. Diharapkan 5 bagian (menit jam tgl_bln bln hr_dlm_mggu)."
        )
    minute, hour, day, month, day_of_week = parts
    return CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone="UTC",
    )


def main():
    parser = argparse.ArgumentParser(description="IRIS Classification Worker Scheduler")
    parser.add_argument("--once", action="store_true", help="Jalankan job sekali lalu langsung keluar.")
    parser.add_argument("--dry-run", action="store_true", help="Jalankan job dalam mode dry-run.")
    args = parser.parse_args()

    if args.once:
        print("Menjalankan clf_weekly satu kali (--once)...")
        run_clf_weekly(dry_run=args.dry_run)
        print("Selesai.")
        return

    sched = BlockingScheduler()
    trigger = parse_cron(config.CLF_CRON)

    def job_wrapper():
        print("Memicu eksekusi terjadwal clf_weekly...")
        try:
            run_clf_weekly(dry_run=args.dry_run)
        except Exception as e:
            print(f"ERROR saat eksekusi job clf_weekly: {e}", file=sys.stderr)

    sched.add_job(job_wrapper, trigger=trigger, id="clf_weekly", name="Weekly BTC Classification")
    print(f"Scheduler aktif. Menunggu jadwal CLF_CRON='{config.CLF_CRON}' (UTC)... (Tekan Ctrl+C untuk berhenti)")
    try:
        sched.start()
    except (KeyboardInterrupt, SystemExit):
        print("Scheduler dimatikan.")


if __name__ == "__main__":
    main()
