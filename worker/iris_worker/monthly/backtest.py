"""Rolling-origin, out-of-sample backtest + leakage-free band recalibration.

Information discipline (what the model may see at origin ``t``)
---------------------------------------------------------------
``r[i]`` is the log return ending at close ``i + 1``; origin ``t`` has seen
``r[:t]`` and is scored on ``y_h = r[t : t + h].sum()``.

* GARCH parameters: re-fitted every ``refit_every_days`` on ``r[:t]`` only.
* Volatility state at ``t``: filtered forward with those parameters over ``r[:t]``.
* Residual pool and the removed drift: from ``r[:t]`` only.
* Calibration factors used at ``t``: estimated only from earlier origins ``t'``
  whose outcome is already known, i.e. ``t' + h <= t``. Requiring ``t' < t``
  would not be enough — an origin one week earlier has a 30-day outcome that
  ends three weeks *after* ``t``. That is the leakage this module rules out,
  and ``tests/test_worker.py::test_backtest_has_no_lookahead`` checks it by
  rewriting the future and asserting the past does not move.

Recalibration (``fhs_cal``) — evaluated, NOT shipped
----------------------------------------------------
FHS with drift removed is slightly too narrow at 30 days and misses mostly on
the upside. Bands are rescaled around the median, separately per side and per
horizon, in log space:

    upper quantile  q' = med + k_up(h) * (q - med)
    lower quantile  q' = med - k_dn(h) * (med - q)

``k_up(h)`` is the split-conformal quantile of ``(y - med) / (q90 - med)`` over
the calibration origins, at level ``ceil((n + 1) * 0.9) / n``; ``k_dn``
likewise for the lower side. That targets 10 % exceedance on each side of the
P10–P90 band. The median is untouched — this changes width, never direction.

Result on BTC 2015–2026 (scored on the same 329 post-warm-up origins): it moved
30-day coverage from 79.0 % to 86.6 % and raised pinball loss at 7, 14 and 30
days. Rolling windows (52/104/156 origins) and a symmetric variant also raised
pinball everywhere. The expanding asymmetric form above is the one specified
before looking at results, so it is the one reported; picking whichever variant
scored best on these origins would itself leak the test set into the choice.
The production run therefore publishes raw FHS bands (``--calibrate`` opts in).

Metrics
-------
coverage of the 50/80/90 % central bands, pinball loss over the 7-quantile
ladder (lower is better, cannot be gamed by width), a 10-bin PIT histogram, and
``independent`` = evaluated origins / (h / step). Also reported, because people
ask for a single error number: MAPE of the median against the realised price,
the same for the naive "price stays where it is" forecast, and the mean P10–P90
width as a share of spot. With drift removed the median is near spot, so its MAPE
tracks the naive one by design — it measures how far BTC moves, not model skill;
coverage and pinball are what separate the engines.

All methods are scored on the **same** origins: those after the calibration
warm-up, so the calibrated engine is never compared on an easier subset.
"""

from __future__ import annotations

import math
from statistics import NormalDist

import numpy as np

from .fhs import DEFAULT_QUANTILES, simulate
from .dvol import realised_windows, start_sigma as dvol_start_sigma
from .garch import GarchFit, filter_sigma, fit_garch11, forecast_sigma_path

BANDS = {50: (0.25, 0.75), 80: (0.10, 0.90), 90: (0.05, 0.95)}
METHOD_LABELS = {
    "fhs": "FHS · GARCH-filtered bootstrap",
    "fhs_dvol": "FHS, start vol = DVOL x walk-forward VRP",
    "fhs_cal": "FHS + conformal recalibration (evaluated, not shipped)",
    "iid": "i.i.d. bootstrap",
    "garch_normal": "GARCH + Normal (closed form)",
}
BASE_METHODS = ("fhs", "fhs_cal", "iid", "garch_normal")
TARGET_TAIL = 0.10           # each side of the P10–P90 band
K_CLIP = (0.5, 3.0)          # guard against a degenerate calibration window
I10, I50, I90 = 1, 3, 5      # indices into DEFAULT_QUANTILES
_ND = NormalDist()


def _pinball(y: float, qs: np.ndarray, levels: np.ndarray) -> float:
    d = y - qs
    return float(np.mean(np.maximum(levels * d, (levels - 1) * d)))


def _score(u: float, y: float, qs: np.ndarray, levels: np.ndarray) -> tuple:
    """Per-origin record: (PIT, pinball, |median - actual| / actual, P10–P90 width / spot).

    ``y`` and ``qs`` are cumulative log returns, so prices are ``spot * exp(.)`` and
    spot cancels from both ratios.
    """
    actual = math.exp(y)
    ape = abs(math.exp(qs[I50]) - actual) / actual
    width = math.exp(qs[I90]) - math.exp(qs[I10])
    return (u, _pinball(y, qs, levels), ape, width)


def conformal_k(ratios: np.ndarray, tail: float = TARGET_TAIL) -> float:
    """Finite-sample split-conformal quantile of the side ratios."""
    x = np.sort(np.asarray(ratios, dtype=float)[np.isfinite(ratios)])
    n = len(x)
    if n == 0:
        return 1.0
    level = min(1.0, math.ceil((n + 1) * (1 - tail)) / n)
    k = float(np.quantile(x, level, method="higher"))
    return float(np.clip(k, *K_CLIP))


def side_ratios(y: np.ndarray, q: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """``q`` is (..., 7) log-return quantiles; returns (up, down) ratios."""
    med = q[..., I50]
    with np.errstate(divide="ignore", invalid="ignore"):
        up = (y - med) / (q[..., I90] - med)
        dn = (med - y) / (med - q[..., I10])
    return up, dn


def scale_quantiles(q: np.ndarray, k_up: float, k_dn: float) -> np.ndarray:
    med = q[..., I50:I50 + 1]
    return np.where(DEFAULT_QUANTILES > 0.5, med + k_up * (q - med),
                    np.where(DEFAULT_QUANTILES < 0.5, med - k_dn * (med - q), q))


def scale_values(c: np.ndarray, med: float, k_up: float, k_dn: float) -> np.ndarray:
    return np.where(c > med, med + k_up * (c - med), med - k_dn * (med - c))


def run_backtest(
    log_returns: np.ndarray,
    dates: list[str],
    horizons: tuple[int, ...] = (7, 14, 30),
    train_min_days: int = 1460,
    step_days: int = 7,
    refit_every_days: int = 365,
    n_paths: int = 1000,
    seed: int = 7,
    min_cal_origins: int = 52,
    cal_window: int | None = None,
    symmetric: bool = False,
    dvol_sigma: np.ndarray | None = None,
    return_records: bool = False,
) -> dict:
    """``dates[i]`` is the date of the close that ends return ``i``; origin ``t``
    is therefore dated ``dates[t - 1]`` (the last close the model has seen).

    ``dvol_sigma`` (optional) is DVOL as a daily sigma per *close*, length
    ``len(log_returns) + 1`` (``dvol.align``). When given, the ``fhs_dvol``
    engine is added and every engine is scored only on origins where it exists.
    """
    r = np.asarray(log_returns, dtype=float)
    n = len(r)
    H = max(horizons)
    levels = DEFAULT_QUANTILES
    if n < train_min_days + H + step_days:
        raise ValueError(f"backtest needs > {train_min_days + H} returns, got {n}")

    origins = np.arange(train_min_days, n - H + 1, step_days)
    K = len(origins)

    # Per-origin FHS output, kept so calibration can be done walk-forward afterwards.
    fhs_q = np.empty((K, H, len(levels)))          # log-return quantiles, steps 1..H
    y_all = np.empty((K, H))                       # realised cumulative log return, 1..H
    fhs_cum = {h: np.empty((K, n_paths)) for h in horizons}
    use_dvol = dvol_sigma is not None
    sim_methods = ("fhs", "iid", "garch_normal") + (("fhs_dvol",) if use_dvol else ())
    METHODS = BASE_METHODS[:1] + (("fhs_dvol",) if use_dvol else ()) + BASE_METHODS[1:]
    base = {m: {h: np.full((K, 4), np.nan) for h in horizons} for m in sim_methods}
    has_dvol = np.zeros(K, dtype=bool)
    rv = realised_windows(r) if use_dvol else None

    fit: GarchFit | None = None
    pool = None
    fit_end = -1
    for k, t in enumerate(origins):
        past = r[:t]                                # everything the model may see
        if fit is None or t - fit_end >= refit_every_days:
            fit_end = t
            train = past - past.mean()
            fit = fit_garch11(train)
            z = train / fit.sigma
            pool = z[np.isfinite(z)]

        hist = past - past.mean()
        _, s_now = filter_sigma(hist, fit)
        fhs = simulate(hist, H, n_paths, seed + k, "fhs", "none", fit=fit,
                       start_sigma=s_now, residual_pool=pool)
        iid = simulate(hist, H, n_paths, seed + k, "iid", "none", fit=fit)
        sig_path = forecast_sigma_path(fit, H, s_now)
        dv = dvol_start_sigma(dvol_sigma, rv, t) if use_dvol else None
        if dv is not None:
            has_dvol[k] = True
            fdv = simulate(hist, H, n_paths, seed + k, "fhs", "none", fit=fit,
                           start_sigma=dv[0], residual_pool=pool)

        fhs_q[k] = np.quantile(fhs.cum[1:], levels, axis=1).T
        y_all[k] = np.cumsum(r[t:t + H])            # the future: used only for scoring

        for h in horizons:
            y = y_all[k, h - 1]
            fhs_cum[h][k] = fhs.cum[h]
            for m, sim in (("fhs", fhs), ("iid", iid)):
                c = sim.cum[h]
                base[m][h][k] = _score(float((c <= y).mean()), y, np.quantile(c, levels), levels)
            s = float(np.sqrt(np.sum(sig_path[:h] ** 2)))
            qs = np.array([_ND.inv_cdf(q) * s for q in levels])
            base["garch_normal"][h][k] = _score(_ND.cdf(y / s) if s > 0 else 0.5, y, qs, levels)
            if dv is not None:
                c = fdv.cum[h]
                base["fhs_dvol"][h][k] = _score(float((c <= y).mean()), y, np.quantile(c, levels), levels)

    # ---- walk-forward calibration: origin k may only use j with t_j + h <= t_k
    up_all, dn_all = side_ratios(y_all, fhs_q)      # (K, H)
    known = origins[None, :] + np.arange(1, H + 1)[:, None]   # (H, K): when j's h-outcome is known
    k_up = np.full((K, H), np.nan)
    k_dn = np.full((K, H), np.nan)
    for k, t in enumerate(origins):
        for h in range(1, H + 1):
            mask = known[h - 1] <= t
            if cal_window is not None:
                idx = np.flatnonzero(mask)[-cal_window:]
                mask = np.zeros(K, dtype=bool)
                mask[idx] = True
            if mask.sum() >= min_cal_origins:
                if symmetric:
                    kk = conformal_k(np.maximum(up_all[mask, h - 1], dn_all[mask, h - 1]), tail=2 * TARGET_TAIL)
                    k_up[k, h - 1] = k_dn[k, h - 1] = kk
                else:
                    k_up[k, h - 1] = conformal_k(up_all[mask, h - 1])
                    k_dn[k, h - 1] = conformal_k(dn_all[mask, h - 1])

    evaluable = np.isfinite(k_up[:, H - 1])         # implies every shorter horizon too
    if use_dvol:
        evaluable &= has_dvol                       # same origins for every engine
    ev = np.flatnonzero(evaluable)
    if len(ev) == 0:
        raise ValueError("not enough origins to warm up the calibration")

    cal = {h: np.full((K, 4), np.nan) for h in horizons}
    for k in ev:
        for h in horizons:
            y = y_all[k, h - 1]
            ku, kd = k_up[k, h - 1], k_dn[k, h - 1]
            med = fhs_q[k, h - 1, I50]
            c = scale_values(fhs_cum[h][k], med, ku, kd)
            qs = scale_quantiles(fhs_q[k, h - 1], ku, kd)
            cal[h][k] = _score(float((c <= y).mean()), y, qs, levels)

    scores = {**base, "fhs_cal": cal}

    def summarise(m: str, h: int) -> dict:
        u = scores[m][h][ev, 0]
        cov = {str(b): float(((u >= lo) & (u <= hi)).mean()) for b, (lo, hi) in BANDS.items()}
        hist10, _ = np.histogram(u, bins=10, range=(0, 1))
        return {"method": m, "label": METHOD_LABELS[m], "coverage": cov,
                "pinball": float(scores[m][h][ev, 1].mean()), "pit": hist10.astype(int).tolist(),
                "upper_miss": float((u > BANDS[80][1]).mean()),
                "lower_miss": float((u < BANDS[80][0]).mean()),
                # Point error of the median, in price terms. With drift removed the median
                # sits on spot, so this tracks the naive "no change" error by construction.
                "mape_median": float(scores[m][h][ev, 2].mean()),
                "median_ape_median": float(np.median(scores[m][h][ev, 2])),
                "width80_pct": float(scores[m][h][ev, 3].mean())}

    def naive_mape(h: int) -> float:
        a = np.exp(y_all[ev, h - 1])
        return float(np.mean(np.abs(1.0 - a) / a))      # forecast = today's price

    out_h = [{"h": h, "origins": int(len(ev)), "independent": int(len(ev) * step_days // h),
              "naive_mape": naive_mape(h),
              "methods": [summarise(m, h) for m in METHODS]} for h in horizons]

    def by_year(m: str) -> list[dict]:
        lo, hi = BANDS[80]
        acc: dict[str, list[float]] = {}
        for k in ev:
            u = scores[m][H][k, 0]
            acc.setdefault(dates[origins[k] - 1][:4], []).append(1.0 if lo <= u <= hi else 0.0)
        return [{"year": y, "coverage": float(np.mean(v)), "origins": len(v)} for y, v in sorted(acc.items())]

    # Production factors: every origin's outcome is known by the last close.
    sl = slice(-cal_window, None) if cal_window else slice(None)
    if symmetric:
        prod_up = prod_dn = [conformal_k(np.maximum(up_all[sl, h], dn_all[sl, h]), tail=2 * TARGET_TAIL)
                             for h in range(H)]
    else:
        prod_up = [conformal_k(up_all[sl, h]) for h in range(H)]
        prod_dn = [conformal_k(dn_all[sl, h]) for h in range(H)]

    out = {
        "origins": int(len(ev)),
        "warmup_origins": int(K - len(ev)),   # calibration warm-up and, with DVOL, pre-DVOL origins
        "first_origin": dates[origins[ev[0]] - 1],
        "last_origin": dates[origins[-1] - 1],
        "step_days": step_days,
        "refit_every_days": refit_every_days,
        "train_min_days": train_min_days,
        "n_paths": n_paths,
        "horizons": out_h,
        "fhs_coverage80_by_year_h30": by_year("fhs"),
        "fhs_cal_coverage80_by_year_h30": by_year("fhs_cal"),
        "fhs_dvol_coverage80_by_year_h30": by_year("fhs_dvol") if use_dvol else [],
        "dvol_used": use_dvol,
        "calibration": {
            "method": "asymmetric split-conformal scaling of FHS bands around the median",
            "target_tail_each_side": TARGET_TAIL,
            "k_up": prod_up,
            "k_down": prod_dn,
            "n_origins": int(K if cal_window is None else min(K, cal_window)),
            "min_cal_origins": min_cal_origins,
            "window": cal_window,
            "symmetric": symmetric,
        },
    }
    if return_records:
        out["records"] = [
            {"t": int(origins[k]),
             "scores": {m: {h: scores[m][h][k].tolist() for h in horizons} for m in METHODS}}
            for k in ev
        ]
    return out
