"""Does Deribit's implied volatility (DVOL) improve the monthly bands?

    python worker/research/dvol_monthly.py btc_closes.csv dvol_btc_daily.csv
    python worker/research/dvol_monthly.py btc_closes.csv dvol_btc_daily.csv --self-test

Same protocol as ``improve_monthly.py``, fixed before looking at results:
candidates declared below, the winner chosen on **validation** origins
(DVOL start + warm-up .. 2022-12), scored **once** on **test** origins
(2023-01 ..) against the shipped baseline with a Diebold–Mariano test
(Newey–West lag = h / step).

Information discipline at origin ``t`` (close ``t`` is the last one seen):
* returns ``r[:t]`` only — GARCH fit, vol state, residual pool, drift;
* DVOL: the daily close dated the same day as the last BTC close. Both are
  midnight-UTC closes of that day, so nothing later than the origin is used;
* variance-risk-premium factor: DVOL is a risk-neutral, 30-day *forward* vol
  and sits above realised vol most of the time. The factor is the median of
  realised-30d-vol / DVOL over past days ``i`` whose 30-day window had fully
  closed by the origin (``i + 30 <= t``) — never a window still running.
``--self-test`` rewrites all returns and DVOL after a cut-off and asserts every
origin scored before it is unchanged.

Candidates
  fhs_base       shipped: GARCH-FHS, start vol = GARCH conditional vol
  fhs_dvol       FHS, start vol = DVOL (daily)
  fhs_dvol_vrp   FHS, start vol = DVOL x walk-forward VRP factor
  fhs_blend      FHS, start var = mean of GARCH var and (VRP-adjusted DVOL) var
  gn_dvol_vrp    Normal, flat vol = DVOL x VRP factor (DVOL *is* a 30-day vol)
  ens_base_gn    average of fhs_base and gn_dvol_vrp quantiles
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path
from statistics import NormalDist

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from iris_worker.monthly.fhs import DEFAULT_QUANTILES, simulate  # noqa: E402
from iris_worker.monthly.garch import filter_sigma, fit_garch11  # noqa: E402
from iris_worker.monthly.prices import csv_daily  # noqa: E402

LEVELS = DEFAULT_QUANTILES
HORIZONS = (7, 14, 30)
H = max(HORIZONS)
STEP = 7
N_PATHS = 1000
VRP_WINDOW = 30
VRP_MIN_PAIRS = 90
TEST_START = "2023-01-01"
ND = NormalDist()
Z = np.array([ND.inv_cdf(q) for q in LEVELS])
NAMES = ["fhs_base", "fhs_dvol", "fhs_dvol_vrp", "fhs_blend", "gn_dvol_vrp", "ens_base_gn"]


def pinball(y, q):
    d = y - q
    return float(np.mean(np.maximum(LEVELS * d, (LEVELS - 1) * d)))


def dm_test(loss_a, loss_b, lag):
    d = np.asarray(loss_a) - np.asarray(loss_b)
    n, x = len(d), d - d.mean()
    var = x @ x / n
    for k in range(1, lag + 1):
        var += 2 * (1 - k / (lag + 1)) * (x[k:] @ x[:-k]) / n
    t = d.mean() / math.sqrt(max(var, 1e-18) / n)
    return t, 2 * (1 - ND.cdf(abs(t)))


def load_dvol(path):
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            out[row["date"][:10]] = float(row["close"])
    return out


def run(r, close_dates, dvol_by_date):
    """r[i] ends at close_dates[i + 1]; origin t has seen closes up to close_dates[t]."""
    n = len(r)
    # DVOL aligned to returns: dv[i] = DVOL at the close that *starts* return i (= close i)
    dv = np.array([dvol_by_date.get(close_dates[i], np.nan) for i in range(n)]) / 100 / math.sqrt(365)
    # realised 30d vol of the window starting at close i (known only once i + 30 <= t)
    rv = np.full(n, np.nan)
    for i in range(n - VRP_WINDOW + 1):
        rv[i] = r[i:i + VRP_WINDOW].std() * 1.0
    first_dv = int(np.flatnonzero(np.isfinite(dv))[0])
    t0 = max(1460, first_dv + VRP_WINDOW + VRP_MIN_PAIRS)
    origins = [t for t in range(t0, n - H + 1, STEP) if np.isfinite(dv[t])]

    Q = {m: {h: [] for h in HORIZONS} for m in NAMES}
    Y = {h: [] for h in HORIZONS}
    odates, fit, fit_end, pool = [], None, -10**9, None
    for k, t in enumerate(origins):
        past = r[:t]
        hist = past - past.mean()
        if fit is None or t - fit_end >= 365:
            fit_end, fit = t, fit_garch11(hist)
            z = hist / fit.sigma
            pool = z[np.isfinite(z)]
        _, s_garch = filter_sigma(hist, fit)

        # VRP factor from windows that had closed by t: i + 30 <= t
        idx = np.arange(first_dv, t - VRP_WINDOW + 1)
        ok = idx[np.isfinite(dv[idx]) & np.isfinite(rv[idx])]
        vrp = float(np.median(rv[ok] / dv[ok])) if len(ok) >= VRP_MIN_PAIRS else 1.0

        s_dv = dv[t]                      # DVOL at the origin's own close
        s_dvv = s_dv * vrp
        s_bl = math.sqrt(0.5 * s_garch**2 + 0.5 * s_dvv**2)
        sim = lambda s0: simulate(hist, H, N_PATHS, 7 + k, "fhs", "none",  # noqa: E731
                                  fit=fit, start_sigma=s0, residual_pool=pool)
        sb, sd, sdv, sbl = sim(s_garch), sim(s_dv), sim(s_dvv), sim(s_bl)

        for h in HORIZONS:
            qb = np.quantile(sb.cum[h], LEVELS)
            gn = Z * s_dvv * math.sqrt(h)
            Q["fhs_base"][h].append(qb)
            Q["fhs_dvol"][h].append(np.quantile(sd.cum[h], LEVELS))
            Q["fhs_dvol_vrp"][h].append(np.quantile(sdv.cum[h], LEVELS))
            Q["fhs_blend"][h].append(np.quantile(sbl.cum[h], LEVELS))
            Q["gn_dvol_vrp"][h].append(gn)
            Q["ens_base_gn"][h].append((qb + gn) / 2)
            Y[h].append(float(r[t:t + h].sum()))
        odates.append(close_dates[t])
    return np.array(origins), np.array(odates), Q, Y


def report(odates, Q, Y):
    val, test = odates < TEST_START, odates >= TEST_START

    def L(m, h, mask):
        q, y = np.array(Q[m][h])[mask], np.array(Y[h])[mask]
        return np.array([pinball(a, b) for a, b in zip(y, q)]), q, y

    cov = lambda q, y: float(((y >= q[:, 1]) & (y <= q[:, 5])).mean())  # noqa: E731
    print(f"origins: validation {val.sum()} ({odates[val][0]}..{odates[val][-1]}), "
          f"test {test.sum()} ({odates[test][0]}..{odates[test][-1]})\n")
    print("VALIDATION — pinball vs fhs_base (negative = better) and P10–P90 coverage")
    print(f"{'candidate':<14}" + "".join(f"{f'{h}d rel':>10}{f'{h}d cov':>9}" for h in HORIZONS) + f"{'mean rel':>10}")
    score = {}
    for m in NAMES:
        rels, cells = [], ""
        for h in HORIZONS:
            lb = L("fhs_base", h, val)[0]
            lm, q, y = L(m, h, val)
            rels.append(lm.mean() / lb.mean() - 1)
            cells += f"{rels[-1]:>+10.2%}{cov(q, y):>9.1%}"
        score[m] = float(np.mean(rels))
        print(f"{m:<14}{cells}{score[m]:>+10.2%}")
    win = min((m for m in NAMES if m != "fhs_base"), key=score.get)
    print(f"\nwinner on validation: {win} ({score[win]:+.2%})")
    print("\nTEST (scored once) — winner vs fhs_base, Diebold–Mariano, Newey–West lag = h/step")
    print(f"{'h':>3} {'base pin':>9} {'win pin':>9} {'rel':>8} {'base cov':>9} {'win cov':>8} {'DM t':>7} {'p':>6}")
    for h in HORIZONS:
        lb, qb, y = L("fhs_base", h, test)
        lw, qw, _ = L(win, h, test)
        t_, p_ = dm_test(lb, lw, max(1, math.ceil(h / STEP)))
        print(f"{h:>3} {lb.mean():>9.4f} {lw.mean():>9.4f} {lw.mean() / lb.mean() - 1:>+8.2%} "
              f"{cov(qb, y):>9.1%} {cov(qw, y):>8.1%} {t_:>7.2f} {p_:>6.3f}")
    return win


def self_test(r, dates, dvol):
    o1, _, Q1, _ = run(r, dates, dvol)
    cut = int(o1[len(o1) // 2])
    r2 = r.copy()
    r2[cut:] = np.random.default_rng(1).standard_normal(len(r) - cut) * 0.07
    dv2 = {d: (v * 3 if d >= dates[cut + 1] else v) for d, v in dvol.items()}
    o2, _, Q2, _ = run(r2, dates, dv2)
    checked = 0
    for j, t in enumerate(o1):
        if t + H <= cut:
            for m in NAMES:
                for h in HORIZONS:
                    assert np.array_equal(Q1[m][h][j], Q2[m][h][j]), f"lookahead at origin {t} ({m}, {h}d)"
            checked += 1
    changed = any(not np.array_equal(Q1["fhs_dvol"][30][j], Q2["fhs_dvol"][30][j])
                  for j, t in enumerate(o1) if t > cut)
    assert checked > 10 and changed
    print(f"self-test passed: {checked} origins unaffected by a rewritten future; later origins do change")


def main(argv):
    s = csv_daily(argv[0])
    r = np.diff(np.log(np.asarray(s.closes)))
    dvol = load_dvol(argv[1])
    if "--self-test" in argv:
        self_test(r, s.dates, dvol)
        return
    _, odates, Q, Y = run(r, s.dates, dvol)
    report(odates, Q, Y)


if __name__ == "__main__":
    main(sys.argv[1:])
