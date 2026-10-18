"""
Watcher.Guru news collection — one canonical cycle of the researcher's pipeline.

The pipeline itself lives in `news_pipeline/` at the repository root, copied
unchanged from christoverhendri/bitcoin-iris (branch azan-sentiment):
public Telegram preview t.me/s/WatcherGuru -> SQLite raw inbox -> parser ->
JSON snapshot that the dashboard reads (`src/lib/sources/watcherGuru.ts`).

This job only runs `python -m news_pipeline.terminal_snapshot --live` once, as a
subprocess from the repository root, so the pipeline keeps its own module paths,
writer lock and fetch back-off (a failed fetch schedules `next_retry_at`; the
next cycle defers until then instead of hammering Telegram).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATABASE = REPO_ROOT / "worker" / "data" / "news" / "data.sqlite"
SNAPSHOT = REPO_ROOT / ".data" / "watcher-guru.json"

TIMEOUT_SEC = 120


def command() -> list[str]:
    return [
        sys.executable, "-m", "news_pipeline.terminal_snapshot", "--live",
        "--database", str(DATABASE),
        "--output", str(SNAPSHOT),
    ]


def run_watcher_news() -> str:
    """One collect -> process -> publish cycle. Raises on failure (stderr included)."""
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    done = subprocess.run(
        command(), cwd=REPO_ROOT, capture_output=True, text=True, timeout=TIMEOUT_SEC,
    )
    if done.returncode != 0:
        tail = (done.stderr or done.stdout).strip().splitlines()[-3:]
        raise RuntimeError(f"news_pipeline exit {done.returncode}: {' | '.join(tail)}")
    return done.stdout.strip()
