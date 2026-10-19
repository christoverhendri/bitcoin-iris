"""Deribit DVOL — the option market's 30-day implied volatility for BTC.

Why it is here: with price history as the only input the monthly bands were at
their ceiling (``research/improve_monthly.py``). DVOL is forward-looking
information price does not contain. In the pre-registered test
(``research/dvol_monthly.py``) starting the FHS paths from a VRP-adjusted DVOL
lowered pinball loss by 1.2–1.5 % at 7/14/30 days on 2023–2026 origins, the
first candidate whose validation gain carried over to test (not significant at
5 %: DM p = 0.21 / 0.26 / 0.09).

Variance risk premium (VRP): DVOL is a risk-neutral expectation and usually sits
above the volatility that is then realised. The start vol is therefore
``DVOL x median(realised 30d vol / DVOL)``, the median taken over past days whose
30-day window had *closed* by the origin — never a window still running.

Alignment: ``sigma[i]`` is DVOL at BTC close ``i`` (both are midnight-UTC closes
of the same day), as a daily sigma. Origin ``t`` (which has seen closes up to
``t``) may use ``sigma[:t + 1]`` only.
"""

from __future__ import annotations

import csv
import math
import time
from datetime import datetime, timezone

import numpy as np
import requests

URL = "https://www.deribit.com/api/v2/public/get_volatility_index_data"
VRP_WINDOW = 30
VRP_MIN_PAIRS = 90
#: How many days old the latest DVOL may be and still be used for today's run.
MAX_STALE_DAYS = 1


def fetch_dvol(start: str = "2021-01-01", session: requests.Session | None = None) -> dict[str, float]:
    """Daily DVOL closes from Deribit, paged backwards via ``continuation``."""
    s = session or requests.Session()
    lo = int(datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    hi = int(time.time() * 1000)
    out: dict[str, float] = {}
    for _ in range(50):  # ~1000 points per page; 50 pages is decades of daily data
        resp = s.get(URL, params={"currency": "BTC", "resolution": "1D",
                                  "start_timestamp": lo, "end_timestamp": hi}, timeout=30)
        resp.raise_for_status()
        res = resp.json()["result"]
        for ts, _o, _h, _l, close in res["data"]:
            out[datetime.fromtimestamp(ts / 1000, timezone.utc).date().isoformat()] = float(close)
        cont = res.get("continuation")
        if not cont or not res["data"]:
            break
        hi = int(cont)
        time.sleep(0.2)
    if len(out) < 200:
        raise RuntimeError(f"deribit returned only {len(out)} DVOL days")
    return out


def load_dvol_csv(path: str) -> dict[str, float]:
    with open(path, newline="", encoding="utf-8") as f:
        return {row["date"][:10]: float(row["close"]) for row in csv.DictReader(f)}


def align(close_dates: list[str], dvol_by_date: dict[str, float]) -> np.ndarray:
    """Daily-sigma DVOL for each BTC close date; NaN where DVOL has no value."""
    v = np.array([dvol_by_date.get(d, np.nan) for d in close_dates], dtype=float)
    return v / 100.0 / math.sqrt(365)


def realised_windows(r: np.ndarray, window: int = VRP_WINDOW) -> np.ndarray:
    """``rv[i]`` = std of ``r[i : i + window]`` (the window starting at close ``i``)."""
    r = np.asarray(r, dtype=float)
    out = np.full(len(r), np.nan)
    if len(r) >= window:
        c1 = np.concatenate([[0.0], np.cumsum(r)])
        c2 = np.concatenate([[0.0], np.cumsum(r * r)])
        m = (c1[window:] - c1[:-window]) / window
        v = (c2[window:] - c2[:-window]) / window - m * m
        out[: len(m)] = np.sqrt(np.maximum(v, 0.0))
    return out


def vrp_factor(sigma: np.ndarray, rv: np.ndarray, t: int,
               window: int = VRP_WINDOW, min_pairs: int = VRP_MIN_PAIRS) -> float | None:
    """Median realised/implied over windows that closed by origin ``t`` (``i + window <= t``)."""
    hi = t - window + 1
    if hi <= 0:
        return None
    s, v = sigma[:hi], rv[:hi]
    ok = np.isfinite(s) & np.isfinite(v) & (s > 0)
    if ok.sum() < min_pairs:
        return None
    return float(np.median(v[ok] / s[ok]))


def start_sigma(sigma: np.ndarray, rv: np.ndarray, t: int) -> tuple[float, float, float] | None:
    """(start sigma, raw DVOL sigma, VRP factor) at origin ``t``, or None if unavailable.

    Uses DVOL at close ``t``; if that day is missing, at most ``MAX_STALE_DAYS``
    earlier — older information is allowed, newer never.
    """
    for lag in range(MAX_STALE_DAYS + 1):
        i = t - lag
        if 0 <= i < len(sigma) and np.isfinite(sigma[i]) and sigma[i] > 0:
            k = vrp_factor(sigma, rv, t)
            if k is None:
                return None
            return float(sigma[i] * k), float(sigma[i]), k
    return None
