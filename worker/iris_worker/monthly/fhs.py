"""Monte Carlo price simulation — Python port of ``src/lib/quant/fhs.ts`` (that TypeScript
original was removed with the Distribution tab on 2026-10-19; this is now the only implementation).

Engines
-------
``fhs``  Filtered Historical Simulation (default). Fit GARCH, standardise the
         returns by their conditional sigma, resample those residuals and
         re-inflate each path through its *own* GARCH variance recursion. Keeps
         volatility clustering and the empirical fat tails; assumes no
         distribution.
``iid``  Plain resampling of (demeaned) raw returns. Kept as the baseline the
         backtest scores FHS against.

Drift
-----
``drift_mode="zero"`` subtracts the sample mean before anything else, so the
median sits on spot. The output is a **distribution of risk, not a directional
call** — see the analysis in ``worker/research/`` for why a directional model
was not shipped: none beat a no-skill baseline out of sample.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .garch import GarchFit, fit_garch11

DEFAULT_QUANTILES = np.array([0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95])


@dataclass
class Simulation:
    #: ``bands[step, q]`` gross multiplier vs spot; row 0 is all ones.
    bands: np.ndarray
    quantiles: np.ndarray
    #: Cumulative log return of every path at every step, shape (horizon+1, n_paths).
    #: Row 0 is zeros.
    cum: np.ndarray
    method: str
    drift_mode: str
    drift_removed: float
    fit: GarchFit
    start_sigma: float
    sigma_path: np.ndarray = field(default_factory=lambda: np.zeros(0))

    @property
    def horizon(self) -> int:
        return self.cum.shape[0] - 1

    def terminal(self, step: int | None = None) -> np.ndarray:
        """Sorted gross multipliers at ``step`` (default: final step)."""
        s = self.horizon if step is None else step
        return np.sort(np.exp(self.cum[s]))

    def prob_above(self, multiplier: float, step: int | None = None) -> float:
        t = self.terminal(step)
        return float((t >= multiplier).mean())

    def representative_paths(self, k: int = 24) -> np.ndarray:
        """``k`` real simulated paths spread evenly across terminal outcomes.

        Picked by terminal rank (from the 5th to the 95th percentile) so the
        lines drawn on the chart span the distribution instead of clustering in
        the middle, which is what ``k`` random draws would do. Returned as gross
        multipliers, shape (k, horizon+1).
        """
        n = self.cum.shape[1]
        order = np.argsort(self.cum[-1])
        ranks = np.linspace(0.05, 0.95, k)
        idx = order[np.clip((ranks * (n - 1)).round().astype(int), 0, n - 1)]
        return np.exp(self.cum[:, idx].T)


def simulate(
    returns: np.ndarray,
    horizon: int,
    n_paths: int = 10_000,
    seed: int = 0,
    method: str = "fhs",
    drift_mode: str = "zero",
    quantiles: np.ndarray = DEFAULT_QUANTILES,
    fit: GarchFit | None = None,
    start_sigma: float | None = None,
    residual_pool: np.ndarray | None = None,
) -> Simulation:
    if method not in ("fhs", "iid"):
        raise ValueError(f"unknown method {method!r}")
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    if len(r) < 30 or horizon < 1:
        raise ValueError("need at least 30 returns and horizon >= 1")

    drift = float(r.mean()) if drift_mode == "zero" else 0.0
    r = r - drift

    fit = fit or fit_garch11(r)
    s0 = start_sigma if (start_sigma is not None and start_sigma > 0) else fit.last_sigma

    if residual_pool is not None:
        pool = np.asarray(residual_pool, dtype=float)
    elif method == "fhs":
        z = r / fit.sigma[: len(r)]
        pool = z[np.isfinite(z)]
    else:
        pool = r
    if method == "fhs" and len(pool) < 30:
        method, pool = "iid", r  # not enough residuals to resample honestly

    rng = np.random.default_rng(seed)
    cum = np.zeros((horizon + 1, n_paths))
    var = np.full(n_paths, s0**2)

    for step in range(1, horizon + 1):
        draw = pool[rng.integers(0, len(pool), n_paths)]
        if method == "fhs":
            ret = np.sqrt(np.maximum(var, 1e-16)) * draw
            var = fit.omega + fit.alpha * ret * ret + fit.beta * var if fit.method == "garch" \
                else 0.94 * var + 0.06 * ret * ret
        else:
            ret = draw
        cum[step] = cum[step - 1] + ret

    bands = np.exp(np.quantile(cum, quantiles, axis=1).T)  # (horizon+1, Q)

    lr = fit.long_run_sigma**2
    h = np.arange(1, horizon + 1)
    pers = min(fit.persistence, 1.0)
    sigma_path = np.sqrt(np.maximum(lr + pers ** (h - 1) * (s0**2 - lr), 1e-16))

    return Simulation(bands, np.asarray(quantiles), cum, method, drift_mode, drift, fit, s0, sigma_path)


def recalibrate(sim: Simulation, k_up, k_down) -> Simulation:
    """Rescale every path around each step's median, per side, in log space.

    ``k_up[s-1]`` / ``k_down[s-1]`` apply at step ``s``. The map is monotone, so
    path ranks — and therefore the median, the representative paths and every
    quantile's identity — are preserved; only distances from the median change.
    Factors come from ``backtest.run_backtest(...)["calibration"]``.
    """
    ku = np.asarray(k_up, dtype=float)
    kd = np.asarray(k_down, dtype=float)
    if len(ku) < sim.horizon or len(kd) < sim.horizon:
        raise ValueError("need one calibration factor per step")
    cum = sim.cum.copy()
    for s in range(1, sim.horizon + 1):
        med = np.median(cum[s])
        c = cum[s]
        cum[s] = np.where(c > med, med + ku[s - 1] * (c - med), med - kd[s - 1] * (med - c))
    bands = np.exp(np.quantile(cum, sim.quantiles, axis=1).T)
    return Simulation(bands, sim.quantiles, cum, sim.method, sim.drift_mode, sim.drift_removed,
                      sim.fit, sim.start_sigma, sim.sigma_path)
