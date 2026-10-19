"""Can the monthly bands be improved without fooling ourselves?

    python worker/research/improve_monthly.py path/to/btc_master_1.csv

Protocol (fixed before running — changing it after seeing test numbers would
defeat it):

* Every candidate is built at each weekly origin ``t`` from ``r[:t]`` only.
* **Validation** origins (2020-04 .. 2022-12) choose the winner: lowest mean
  pinball across 7/14/30 days, relative to the shipped baseline.
* **Test** origins (2023-01 ..) are scored once, for the baseline and the winner
  only, with a Diebold–Mariano test (Newey–West, lag = h / step) on the
  per-origin pinball difference. Overlapping windows make naive t-tests far too
  confident; the HAC correction is not optional here.

Candidates (all pre-declared):

  fhs_base        shipped: GARCH(1,1) refit yearly, full residual pool, zero drift
  fhs_refit28     refit every 28 days instead of 365
  fhs_pool3y      resample only the last 3 years of standardised residuals
  fhs_volblend    start vol = sqrt(0.5 GARCH var + 0.5 realised 30d var)
  fhs_drift25/50  add 25% / 50% of the expanding-window mean daily return
  garch_n         closed-form Normal with the GARCH variance path
  ens_fhs_gn      average of fhs_base and garch_n quantiles (Vincentisation)
  ens3            average of fhs_base, garch_n and i.i.d. quantiles
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from statistics import NormalDist

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from iris_worker.monthly.fhs import DEFAULT_QUANTILES, simulate  # noqa: E402
from iris_worker.monthly.garch import filter_sigma, fit_garch11, forecast_sigma_path  # noqa: E402
from iris_worker.monthly.prices import csv_daily  # noqa: E402

LEVELS = DEFAULT_QUANTILES
HORIZONS = (7, 14, 30)
H = max(HORIZONS)
STEP = 7
TRAIN_MIN = 1460
N_PATHS = 1000
VAL_START, TEST_START = "2020-04-01", "2023-01-01"
ND = NormalDist()


def pinball(y, q):
    d = y - q
    return float(np.mean(np.maximum(LEVELS * d, (LEVELS - 1) * d)))


def dm_test(loss_a, loss_b, lag):
    """Diebold–Mariano on loss_a - loss_b with Newey–West variance. >0 mean => b better."""
    d = np.asarray(loss_a) - np.asarray(loss_b)
    n = len(d)
    dbar = d.mean()
    x = d - dbar
    var = x @ x / n
    for k in range(1, lag + 1):
        w = 1 - k / (lag + 1)
        var += 2 * w * (x[k:] @ x[:-k]) / n
    se = math.sqrt(max(var, 1e-18) / n)
    t = dbar / se
    return t, 2 * (1 - ND.cdf(abs(t)))


class FitStream:
    """GARCH fit refreshed every ``every`` days, using only returns before the origin."""

    def __init__(self, every):
        self.every, self.fit, self.end, self.pool = every, None, -10**9, None

    def at(self, r, t):
        if self.fit is None or t - self.end >= self.every:
            self.end = t
            train = r[:t] - r[:t].mean()
            self.fit = fit_garch11(train)
            z = train / self.fit.sigma
            self.pool = z[np.isfinite(z)]
        return self.fit, self.pool


def main(path):
    s = csv_daily(path)
    r = np.diff(np.log(np.asarray(s.closes)))
    dates = s.dates[1:]
    origins = list(range(TRAIN_MIN, len(r) - H + 1, STEP))
    yearly, monthly = FitStream(365), FitStream(28)

    names = ["fhs_base", "fhs_refit28", "fhs_pool3y", "fhs_volblend", "fhs_drift25", "fhs_drift50",
             "garch_n", "ens_fhs_gn", "ens3"]
    Q = {n: {h: [] for h in HORIZONS} for n in names}
    Y = {h: [] for h in HORIZONS}
    odates = []

    for k, t in enumerate(origins):
        past = r[:t]
        mu = past.mean()
        hist = past - mu
        fit, pool = yearly.at(r, t)
        fit_m, pool_m = monthly.at(r, t)
        _, s_now = filter_sigma(hist, fit)
        _, s_now_m = filter_sigma(hist, fit_m)
        rv30 = past[-30:].std()
        s_blend = math.sqrt(0.5 * s_now**2 + 0.5 * rv30**2)
        # last 3y of the pool: the residuals are aligned with the training window's tail
        pool3 = pool[-1095:]

        sim = lambda **kw: simulate(hist, H, N_PATHS, 7 + k, "fhs", "none", **kw)  # noqa: E731
        base = sim(fit=fit, start_sigma=s_now, residual_pool=pool)
        refit = sim(fit=fit_m, start_sigma=s_now_m, residual_pool=pool_m)
        p3 = sim(fit=fit, start_sigma=s_now, residual_pool=pool3)
        vb = sim(fit=fit, start_sigma=s_blend, residual_pool=pool)
        iid = simulate(hist, H, N_PATHS, 7 + k, "iid", "none", fit=fit)
        sig = forecast_sigma_path(fit, H, s_now)

        for h in HORIZONS:
            qb = np.quantile(base.cum[h], LEVELS)
            gn = np.array([ND.inv_cdf(q) for q in LEVELS]) * math.sqrt(np.sum(sig[:h] ** 2))
            qi = np.quantile(iid.cum[h], LEVELS)
            Q["fhs_base"][h].append(qb)
            Q["fhs_refit28"][h].append(np.quantile(refit.cum[h], LEVELS))
            Q["fhs_pool3y"][h].append(np.quantile(p3.cum[h], LEVELS))
            Q["fhs_volblend"][h].append(np.quantile(vb.cum[h], LEVELS))
            Q["fhs_drift25"][h].append(qb + 0.25 * mu * h)
            Q["fhs_drift50"][h].append(qb + 0.50 * mu * h)
            Q["garch_n"][h].append(gn)
            Q["ens_fhs_gn"][h].append((qb + gn) / 2)
            Q["ens3"][h].append((qb + gn + qi) / 3)
            Y[h].append(float(r[t:t + h].sum()))
        odates.append(dates[t - 1])

    odates = np.array(odates)
    val = (odates >= VAL_START) & (odates < TEST_START)
    test = odates >= TEST_START

    def losses(n, h, mask):
        q = np.array(Q[n][h])[mask]
        y = np.array(Y[h])[mask]
        return np.array([pinball(a, b) for a, b in zip(y, q)]), q, y

    def cov80(q, y):
        return float(((y >= q[:, 1]) & (y <= q[:, 5])).mean())

    print(f"origins: validation {val.sum()} ({VAL_START}..{TEST_START}), test {test.sum()} ({TEST_START}..)\n")
    print("VALIDATION — pinball relative to fhs_base (negative = better), and P10–P90 coverage")
    print(f"{'candidate':<14}" + "".join(f"{f'{h}d rel':>10}{f'{h}d cov':>9}" for h in HORIZONS) + f"{'mean rel':>10}")
    score = {}
    for n in names:
        rels, cells = [], ""
        for h in HORIZONS:
            lb, _, _ = losses("fhs_base", h, val)
            ln, q, y = losses(n, h, val)
            rel = ln.mean() / lb.mean() - 1
            rels.append(rel)
            cells += f"{rel:>+10.2%}{cov80(q, y):>9.1%}"
        score[n] = float(np.mean(rels))
        print(f"{n:<14}{cells}{score[n]:>+10.2%}")

    winner = min((n for n in names if n != "fhs_base"), key=score.get)
    print(f"\nwinner on validation: {winner} ({score[winner]:+.2%} mean pinball vs fhs_base)")
    if score[winner] >= 0:
        print("no candidate beat the baseline on validation — keep fhs_base")

    print("\nTEST (scored once) — winner vs fhs_base, Diebold–Mariano with Newey–West lag = h/step")
    print(f"{'h':>3} {'base pin':>9} {'win pin':>9} {'rel':>8} {'base cov':>9} {'win cov':>8} {'DM t':>7} {'p':>6}")
    for h in HORIZONS:
        lb, qb, y = losses("fhs_base", h, test)
        lw, qw, _ = losses(winner, h, test)
        t_, p_ = dm_test(lb, lw, lag=max(1, math.ceil(h / STEP)))
        print(f"{h:>3} {lb.mean():>9.4f} {lw.mean():>9.4f} {lw.mean() / lb.mean() - 1:>+8.2%} "
              f"{cov80(qb, y):>9.1%} {cov80(qw, y):>8.1%} {t_:>7.2f} {p_:>6.3f}")


if __name__ == "__main__":
    main(sys.argv[1])
