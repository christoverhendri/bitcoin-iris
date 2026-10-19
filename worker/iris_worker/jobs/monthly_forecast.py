"""
Monthly (30-day) Monte Carlo forecast — Timothy's worker (`iris_worker.monthly`),
run weekly from this scheduler. GitHub Actions runs the same command
(.github/workflows/monthly-forecast.yml); whichever runs, the row is keyed by the
as-of close, so a second run of the same week only overwrites it.

With Supabase configured the run upserts `monthly_forecast_runs` and re-scores
earlier runs there. Without it (local dev) it runs `--dry-run`: JSON files in
worker/out, earlier files re-scored in place, and the dashboard reads them.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from iris_worker import config

WORKER_DIR = Path(__file__).resolve().parents[2]
OUT_DIR = WORKER_DIR / "out"
TIMEOUT_SEC = 40 * 60


def command() -> list[str]:
    cmd = [sys.executable, "-m", "iris_worker.monthly", "--out", str(OUT_DIR)]
    if not (config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY):
        cmd.append("--dry-run")
    return cmd


def run_monthly_forecast() -> str:
    """One forecast run. Raises on failure with the worker's last lines."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done = subprocess.run(command(), cwd=WORKER_DIR, capture_output=True, text=True, timeout=TIMEOUT_SEC)
    if done.returncode != 0:
        tail = (done.stderr or done.stdout).strip().splitlines()[-3:]
        raise RuntimeError(f"monthly forecast exit {done.returncode}: {' | '.join(tail)}")
    lines = [l for l in done.stdout.splitlines() if l.startswith("[monthly]")]
    return lines[-1] if lines else done.stdout.strip()[-300:]
