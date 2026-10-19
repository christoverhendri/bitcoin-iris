"""Score earlier runs against what the price actually did.

Every weekly run publishes 30 daily bands. Once those days have passed, each
band either held the realised close or it did not. Writing that back to the
earlier run turns the table into a live, out-of-sample track record — the one
check on this model nobody can argue was fitted after the fact.
"""

from __future__ import annotations

BAND_EDGES = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]


def bucket(close: float, band: dict) -> str:
    """Name of the band slice a price fell into, e.g. ``"p25-p50"``."""
    if close < band["p5"]:
        return "<p5"
    for lo, hi in zip(BAND_EDGES, BAND_EDGES[1:]):
        if close < band[hi]:
            return f"{lo}-{hi}"
    return ">p95"


def score_run(bands: list[dict], actual: dict[str, float]) -> dict:
    """``bands``: rows with ``date`` and p5..p95 (step >= 1). ``actual``: date -> close."""
    future = [b for b in bands if b.get("step", 1) >= 1]
    seen = [(b, actual[b["date"]]) for b in future if b["date"] in actual]
    out = {
        "days_total": len(future),
        "days_observed": len(seen),
        "complete": len(seen) == len(future) and len(future) > 0,
        "inside_p10_p90": None,
        "inside_p5_p95": None,
        "last_close": None,
        "last_date": None,
        "last_bucket": None,
    }
    if not seen:
        return out
    out["inside_p10_p90"] = sum(b["p10"] <= c <= b["p90"] for b, c in seen) / len(seen)
    out["inside_p5_p95"] = sum(b["p5"] <= c <= b["p95"] for b, c in seen) / len(seen)
    b, c = seen[-1]
    out.update(last_close=c, last_date=b["date"], last_bucket=bucket(c, b))
    return out
