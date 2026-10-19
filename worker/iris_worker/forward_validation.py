"""
iris_worker.forward_validation
==============================
Forward validation of the WEEKLY signal: every published week-close signal is
scored, once its 7 days have passed, against what price actually did — with the
same label rule the model was trained on (`iris_clf.features.make_label`): UP
when the 7-day log return beats +0.5 x weekly vol, DOWN below -0.5 x weekly vol,
otherwise NOISE (no label, not counted, exactly as in training and the test-set
track record).

Rules (fixed before the first scored week, so nothing can be tuned afterwards):
- Only week-close signals count (as_of on a Sunday, the candle the scheduler
  waits for). Development runs on other days stay in the history but are not
  part of the series.
- Nothing is ever re-predicted or deleted; a published row only gains `realized`.
- Scoring uses the same daily closes the model reads (data/clf/btc_master_2.csv).

Storage: `out/clf_signals_history.jsonl` (written by clf_weekly.write_local) is
scored in place; with Supabase, `clf_signals.realized` (migration 0009) as well.

    python -m iris_worker.forward_validation        # score whatever is due
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests

from iris_clf.features import HORIZON, load_master, make_label
from iris_worker import config

WEEK_CLOSE_WEEKDAY = 6  # Sunday (Monday = 0)


def is_week_close(as_of: str) -> bool:
    return pd.Timestamp(as_of).weekday() == WEEK_CLOSE_WEEKDAY


def score_signal(row: Dict[str, Any], data: pd.DataFrame, labels: pd.Series) -> Optional[Dict[str, Any]]:
    """Outcome of one published signal, or None while its 7 days have not all closed."""
    d = pd.Timestamp(row["as_of"])
    end = d + pd.Timedelta(days=HORIZON)
    if d not in data.index or end not in data.index:
        return None
    c0 = float(data.at[d, "btc_close"])
    c1 = float(data.at[end, "btc_close"])
    lab = labels.get(d)
    label = "NOISE" if lab is None or pd.isna(lab) else ("UP" if lab == 1 else "DOWN")
    signal = row.get("signal")
    correct = None if label == "NOISE" or signal not in ("BULL", "BEAR") else (signal == "BULL") == (label == "UP")
    return {
        "end_date": str(end.date()),
        "close_as_of": c0,
        "close_end": c1,
        "return_7d": c1 / c0 - 1,
        "label": label,
        "correct": correct,
        "week_close": is_week_close(row["as_of"]),
        "scored_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _load(master_path: Optional[Path] = None):
    data = load_master(str(master_path or (config.CLF_DATA_DIR / "btc_master_2.csv")))
    return data, make_label(data)


def score_history_file(history: Path, data: pd.DataFrame, labels: pd.Series) -> int:
    """Score every unscored row of the local JSONL history in place. Returns rows newly scored."""
    if not history.exists():
        return 0
    rows = [json.loads(ln) for ln in history.read_text(encoding="utf-8").splitlines() if ln.strip()]
    n = 0
    for r in rows:
        if r.get("realized"):
            continue
        z = score_signal(r, data, labels)
        if z:
            r["realized"] = z
            n += 1
    if n:
        history.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    return n


def _headers(key: str) -> Dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def score_supabase(url: str, key: str, data: pd.DataFrame, labels: pd.Series) -> int:
    """Same, for `clf_signals` rows whose `realized` is still null."""
    base = f"{url.rstrip('/')}/rest/v1/clf_signals"
    res = requests.get(base, headers=_headers(key), timeout=30,
                       params={"select": "as_of,signal", "realized": "is.null", "order": "as_of.asc"})
    res.raise_for_status()
    n = 0
    for r in res.json():
        z = score_signal(r, data, labels)
        if not z:
            continue
        p = requests.patch(base, headers=_headers(key), params={"as_of": f"eq.{r['as_of']}"},
                           json={"realized": z}, timeout=30)
        p.raise_for_status()
        n += 1
    return n


def run_forward_validation(master_path: Optional[Path] = None, history: Optional[Path] = None) -> str:
    data, labels = _load(master_path)
    hist = history or (Path(config.CLF_SIGNAL_OUT).parent / "clf_signals_history.jsonl")
    n_local = score_history_file(hist, data, labels)
    msg = f"forward_validation: {n_local} sinyal lokal dinilai (data s.d. {data.index.max().date()})"
    if config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY:
        n_db = score_supabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, data, labels)
        msg += f", {n_db} baris clf_signals dinilai"
    return msg


def main() -> None:
    print(run_forward_validation())


if __name__ == "__main__":
    main()
