"""Per-horizon outcomes of a monthly run, for the forward-validation series.

Added in IRIS-Terminal (not in Timothy's repository). `tracking.score_run`
answers "how many of the 30 days stayed inside the band"; these answer the
question a non-overlapping series needs — where did price stand exactly
7 / 14 / 28 days after the as-of close? The dashboard then keeps only runs
spaced at least h days apart for horizon h, so no two scored windows overlap.
"""
from __future__ import annotations

from .tracking import bucket

STEPS = (7, 14, 28)


def score_horizons(bands: list[dict], actual: dict[str, float], steps: tuple[int, ...] = STEPS) -> dict:
    """``{"7": {...}, "14": {...}, "28": {...}}`` for every step whose close is known."""
    by_step = {b.get("step"): b for b in bands}
    out: dict[str, dict] = {}
    for s in steps:
        b = by_step.get(s)
        if not b or b["date"] not in actual:
            continue
        c = actual[b["date"]]
        out[str(s)] = {
            "date": b["date"],
            "close": c,
            "inside80": b["p10"] <= c <= b["p90"],
            "inside90": b["p5"] <= c <= b["p95"],
            "bucket": bucket(c, b),
            "abs_err_median": abs(c / b["p50"] - 1),
        }
    return out
