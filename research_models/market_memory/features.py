"""Transparent path features; all normalizers see only the completed past.

Signatures use exact Chen concatenation for piecewise-linear paths. Merely
reparameterizing the SAME path does not add signature information: B3 therefore
adds cross-clock diagnostics, not an allegedly new signature of a retimed path.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import hashlib
import itertools

import numpy as np

from .data import DAY, HOUR, HourlyData, iso

LOOKBACK = 30
EPS = 1e-16
CHANNELS = ('time', 'price', 'volume', 'variation')
BASE = ('return_1d', 'return_7d', 'return_30d', 'log_rv_1d', 'log_rv_7d',
        'log_rv_30d', 'log_volume_1d', 'log_volume_7d', 'log_range',
        'downside_share', 'rv_top3_share', 'volume_top3_share')
CONTROL = ('memory_return_6h', 'memory_rv_6h', 'memory_return_24h', 'memory_rv_24h',
           'memory_return_168h', 'memory_rv_168h', 'last6h_return', 'last6h_rv_share',
           'weekday_sin', 'weekday_cos', 'seasonal_rv_distance', 'seasonal_volume_distance')
AREAS = tuple('area_' + CHANNELS[i] + '_' + CHANNELS[j]
              for i, j in itertools.combinations(range(4), 2))
CLOCKS = ('rv_centroid', 'volume_centroid', 'clock_sup_distance',
          'clock_signed_integral', 'clock_js_divergence', 'clock_peak_signed_gap')
VARIANTS = {'B0': BASE, 'B1': BASE + CONTROL, 'B2': BASE + CONTROL + AREAS,
            'B3': BASE + CONTROL + AREAS + CLOCKS,
            'B2_SHUFFLED': BASE + CONTROL + tuple('shuffled_' + n for n in AREAS)}


def signature2(increments: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """First and second signature levels (the omitted constant level is 1)."""
    dx = np.asarray(increments, dtype=float)
    if dx.ndim != 2 or not 1 <= dx.shape[1] <= 8 or not np.all(np.isfinite(dx)):
        raise ValueError('Expected finite n-by-d path increments, 1<=d<=8')
    s1 = np.zeros(dx.shape[1])
    s2 = np.zeros((dx.shape[1], dx.shape[1]))
    for step in dx:
        s2 += np.outer(s1, step) + .5 * np.outer(step, step)
        s1 += step
    return s1, s2


def decay_update(previous, observation, elapsed_hours: float, half_life_hours: float):
    """Exact update for constant forcing dm/dt=lambda*(observation-m)."""
    if (not np.isfinite(elapsed_hours) or not np.isfinite(half_life_hours)
            or elapsed_hours < 0 or half_life_hours <= 0):
        raise ValueError('Invalid elapsed time or half-life')
    if not np.all(np.isfinite(previous)) or not np.all(np.isfinite(observation)):
        raise ValueError('Nonfinite memory input')
    gain = -np.expm1(-np.log(2) * elapsed_hours / half_life_hours)
    return np.asarray(previous) + gain * (np.asarray(observation) - previous)


def memory(values: np.ndarray, half_life: float) -> float:
    # Finite 30-day memory, normalized explicitly; never bridge a missing hour.
    n = len(values)
    weights = np.exp2(-np.arange(n - 1, -1, -1) / half_life)
    return float(np.dot(weights, values) / weights.sum())


def geometry(returns: np.ndarray, volume: np.ndarray) -> np.ndarray:
    r, v = np.asarray(returns, float), np.asarray(volume, float)
    rv, total = np.dot(r, r), v.sum()
    if (r.ndim != 1 or r.shape != v.shape or len(r) != 24
            or not np.all(np.isfinite(r)) or not np.all(np.isfinite(v))
            or np.any(v < 0) or rv <= 0 or total <= 0):
        raise ValueError('Path needs 24 valid returns and positive RV/total volume')
    dx = np.column_stack((np.full(24, 1/24), r / np.sqrt(rv), v / total, r*r / rv))
    _, second = signature2(dx)
    return np.array([.5 * (second[i, j] - second[j, i])
                     for i, j in itertools.combinations(range(4), 2)])


def clocks(returns: np.ndarray, volume: np.ndarray) -> np.ndarray:
    r, v = np.asarray(returns, float), np.asarray(volume, float)
    # Same validation as the geometry, including the undefined zero-clock case.
    geometry(r, v)
    q, w = r*r / np.dot(r, r), v / v.sum()
    diff = np.cumsum(q) - np.cumsum(w)
    centres = (np.arange(24) + .5) / 24
    mixed = (q + w) / 2
    def kl(a):
        ok = a > 0
        return float(np.sum(a[ok] * np.log(a[ok] / mixed[ok])))
    return np.array([q @ centres, w @ centres, np.max(np.abs(diff)),
                     np.mean(diff), .5 * (kl(q) + kl(w)), diff[np.argmax(np.abs(diff))]])


@dataclass
class Day:
    start: int
    returns: np.ndarray
    volume: np.ndarray
    high: float
    low: float
    observed_at: int

    @property
    def rv(self):
        return float(self.returns @ self.returns)


@dataclass
class Examples:
    origins: np.ndarray
    target_ends: np.ndarray
    x: dict[str, np.ndarray]
    y: np.ndarray  # log(mean future daily RV), horizon log return, log1p(100*excursion)
    latest_rv: np.ndarray
    ewma_rv: np.ndarray
    feature_rows: list[dict]
    latest: dict | None
    coverage: dict
    horizon: int


def build_examples(data: HourlyData, *, horizon: int, cutoff: int, seed: int = 42) -> Examples:
    if horizon not in (1, 7, 30):
        raise ValueError('Supported horizons: 1, 7 or 30 calendar days')
    if not 0 <= seed <= 2**32 - 1:
        raise ValueError('Seed outside uint32 range')
    reasons = Counter()
    positions = {int(t): i for i, t in enumerate(data.ts) if t + HOUR <= cutoff}
    days = {}
    starts = sorted({t // DAY * DAY for t in positions})
    for d in starts:
        idx = [positions.get(d - HOUR + j * HOUR) for j in range(25)]
        if any(i is None for i in idx):
            reasons['incomplete_day_or_preceding_close'] += 1
            continue
        idx = np.array(idx, dtype=int)
        ohlcv = data.ohlcv[idx]
        r = np.diff(np.log(ohlcv[:, 3]))
        if float(r @ r) <= EPS:
            reasons['zero_or_below_floor_variation'] += 1
            continue
        if ohlcv[1:, 4].sum() <= 0:
            reasons['zero_total_volume_undefined_clock'] += 1
            continue
        days[d] = Day(d, r, ohlcv[1:, 4], float(ohlcv[1:, 1].max()),
                      float(ohlcv[1:, 0].min()), int(data.observed[idx].max()))
    raw_rows, labels, origins, ends, latest_rv, ewma_rv = [], [], [], [], [], []
    last_feature = None
    for d in sorted(days):
        past = [days.get(d - j * DAY) for j in range(LOOKBACK - 1, -1, -1)]
        if any(x is None for x in past):
            reasons['incomplete_30day_feature_window'] += 1
            continue
        today = days[d]
        r, vol, rv = today.returns, today.volume, today.rv
        rs = np.concatenate([x.returns for x in past])
        rvs = np.array([x.rv for x in past])
        volumes = np.array([x.volume.sum() for x in past])
        q, w = r*r/rv, vol/vol.sum()
        # Seasonal templates estimated solely from preceding days of this window.
        seasonal_q = np.mean([x.returns*x.returns/x.rv for x in past[:-1]], axis=0)
        seasonal_v = np.mean([x.volume/x.volume.sum() for x in past[:-1]], axis=0)
        weekday = ((d // DAY + 3) % 7)  # 1970-01-01 was Thursday, Monday=0
        controls = []
        for half_life in (6, 24, 168):
            controls.extend((memory(rs, half_life),
                             np.log(max(24 * memory(rs*rs, half_life), EPS))))
        controls.extend((r[-6:].sum(), q[-6:].sum(),
                         np.sin(2*np.pi*weekday/7), np.cos(2*np.pi*weekday/7),
                         np.max(np.abs(np.cumsum(q-seasonal_q))),
                         np.max(np.abs(np.cumsum(w-seasonal_v)))))
        base = [r.sum(), rs[-7*24:].sum(), rs.sum(), np.log(rv),
                np.log(rvs[-7:].mean()), np.log(rvs.mean()), np.log(vol.sum()),
                np.log(volumes[-7:].mean()), np.log(today.high/today.low),
                q[r < 0].sum(), np.sort(q)[-3:].sum(), np.sort(w)[-3:].sum()]
        perm_seed = int.from_bytes(hashlib.sha256(f'{seed}:{d}:path-v1'.encode()).digest()[:8], 'big')
        perm = np.random.default_rng(perm_seed).permutation(24)
        all_values = [*base, *controls, *geometry(r, vol), *clocks(r, vol),
                      *geometry(r[perm], vol[perm])]
        names = BASE + CONTROL + AREAS + CLOCKS + tuple('shuffled_' + n for n in AREAS)
        row = dict(zip(names, map(float, all_values)))
        if not all(np.isfinite(list(row.values()))):
            raise ValueError('Nonfinite derived feature')
        origin = d + DAY
        last_feature = dict(origin=iso(origin), source_observed_at=iso(max(x.observed_at for x in past)),
                            values=row, historical_backtest_safe=False)
        future = [days.get(d + j * DAY) for j in range(1, horizon + 1)]
        if any(x is None for x in future) or origin + horizon * DAY > cutoff:
            reasons['unmatured_or_incomplete_target_window'] += 1
            continue
        future_r = np.concatenate([x.returns for x in future])
        excursion = max(0., float(-np.cumsum(future_r).min()))
        target = [np.log(np.mean([x.rv for x in future])), future_r.sum(), np.log1p(100 * excursion)]
        raw_rows.append(row)
        labels.append(target)
        origins.append(origin)
        ends.append(origin + horizon * DAY)
        latest_rv.append(rv)
        ewma_rv.append(24 * memory(rs*rs, 168))
    n = len(origins)
    matrices = {key: np.array([[row[name] for name in names] for row in raw_rows], dtype=float)
                .reshape(n, len(names)) for key, names in VARIANTS.items()}
    coverage = {'candidate_days': len(starts), 'complete_positive_days': len(days),
                'eligible_origins': n, 'excluded': dict(reasons),
                'lookback_days': LOOKBACK, 'horizon_days': horizon,
                'first_origin': iso(origins[0]) if n else None,
                'last_origin': iso(origins[-1]) if n else None,
                'analysis_cutoff': iso(cutoff), 'no_gap_filling': True}
    return Examples(np.array(origins, np.int64), np.array(ends, np.int64), matrices,
                    np.array(labels).reshape(n, 3), np.array(latest_rv), np.array(ewma_rv),
                    raw_rows, last_feature, coverage, horizon)
