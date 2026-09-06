/**
 * Conditional volatility models.
 *
 * These exist for one reason: BTC returns are not i.i.d. Volatility arrives in
 * clusters — a violent day is followed by violent days — and any simulation that
 * resamples raw returns independently destroys that structure and produces a
 * distribution far too narrow in the tails.
 *
 * The fix is to model the volatility first, divide it out, and simulate the
 * *standardised* residuals, which really are close to i.i.d. That is what
 * `fhs.ts` does; this file supplies the filter.
 *
 * Two estimators, in order of preference:
 *   - GARCH(1,1) by Gaussian maximum likelihood, with variance targeting
 *   - EWMA (RiskMetrics, lambda 0.94) as the fallback when the fit will not
 *     converge, which happens on short or degenerate samples
 *
 * Everything here is pure and deterministic — no RNG, no clock.
 */

/** Sample variance of a series. Population form; the series is long. */
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  return xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
}

export interface GarchFit {
  /** Constant term of the variance recursion. */
  omega: number;
  /** Weight on the last squared shock — how sharply vol reacts to news. */
  alpha: number;
  /** Weight on the last variance — how long a shock persists. */
  beta: number;
  /** Fitted conditional sigma for every observation, same length as input. */
  sigma: number[];
  /** Conditional sigma for the next step. This is what a forecast starts from. */
  lastSigma: number;
  /** Unconditional (long-run) sigma the process mean-reverts to. */
  longRunSigma: number;
  /** `alpha + beta`. Approaching 1 means shocks decay very slowly. */
  persistence: number;
  /** False when the optimiser hit a boundary — caller should prefer EWMA. */
  converged: boolean;
  /** Which estimator actually produced `sigma`. */
  method: 'garch' | 'ewma';
}

/**
 * Exponentially weighted moving average volatility — the RiskMetrics estimator.
 *
 * A GARCH(1,1) with `alpha = 1 - lambda`, `beta = lambda` and `omega = 0`, i.e.
 * infinite persistence and no mean reversion. Cruder than a fitted GARCH, but it
 * cannot fail to converge, which is exactly why it is the fallback.
 */
export function ewmaSigma(returns: number[], lambda = 0.94): number[] {
  const out: number[] = [];
  if (returns.length === 0) return out;

  let v = variance(returns.slice(0, Math.min(30, returns.length))) || variance(returns);
  if (!(v > 0)) v = 1e-8;

  for (const r of returns) {
    out.push(Math.sqrt(v));
    v = lambda * v + (1 - lambda) * r * r;
  }
  return out;
}

/** Run the variance recursion and return the Gaussian log-likelihood. */
function garchLogLik(
  returns: number[],
  omega: number,
  alpha: number,
  beta: number,
  v0: number,
): { ll: number; sigma: number[]; nextVar: number } {
  const sigma: number[] = new Array(returns.length);
  let v = v0;
  let ll = 0;

  for (let i = 0; i < returns.length; i += 1) {
    if (!(v > 0) || !Number.isFinite(v)) return { ll: -Infinity, sigma, nextVar: v0 };
    sigma[i] = Math.sqrt(v);
    const r = returns[i];
    ll += -0.5 * (Math.log(v) + (r * r) / v);
    v = omega + alpha * r * r + beta * v;
  }

  return { ll, sigma, nextVar: v };
}

/**
 * Fit GARCH(1,1) by grid search over `(alpha, beta)`, refined twice.
 *
 * A coarse grid plus two refinement passes rather than a gradient optimiser:
 * the surface is two-dimensional and well behaved under variance targeting, the
 * whole search is a few thousand cheap recursions, and — unlike an iterative
 * solver with a tolerance — it returns the same answer every time it runs, which
 * server-rendered output requires.
 *
 * `omega` is not searched. Variance targeting pins it to
 * `sigma_LR^2 * (1 - alpha - beta)`, so the fitted process reverts to the
 * sample's own long-run variance by construction. That removes one dimension and
 * stops the fit wandering to a long-run level the data never visited.
 */
export function fitGarch11(returns: number[]): GarchFit {
  const uncondVar = variance(returns);

  // Too short, or no variation at all: EWMA and say so.
  if (returns.length < 100 || !(uncondVar > 0)) {
    const sigma = ewmaSigma(returns);
    const last = sigma[sigma.length - 1] ?? Math.sqrt(Math.max(uncondVar, 1e-8));
    return {
      omega: 0,
      alpha: 0.06,
      beta: 0.94,
      sigma,
      lastSigma: last,
      longRunSigma: Math.sqrt(Math.max(uncondVar, 1e-8)),
      persistence: 1,
      converged: false,
      method: 'ewma',
    };
  }

  /** Stationarity requires alpha + beta < 1; stay strictly inside. */
  const MAX_PERSISTENCE = 0.999;

  let best = { alpha: 0.08, beta: 0.9, ll: -Infinity };

  const search = (
    aLo: number,
    aHi: number,
    bLo: number,
    bHi: number,
    steps: number,
  ) => {
    const aStep = (aHi - aLo) / steps;
    const bStep = (bHi - bLo) / steps;
    for (let i = 0; i <= steps; i += 1) {
      const alpha = aLo + i * aStep;
      if (alpha <= 0) continue;
      for (let j = 0; j <= steps; j += 1) {
        const beta = bLo + j * bStep;
        if (beta < 0) continue;
        if (alpha + beta >= MAX_PERSISTENCE) continue;
        const omega = uncondVar * (1 - alpha - beta);
        if (!(omega > 0)) continue;
        const { ll } = garchLogLik(returns, omega, alpha, beta, uncondVar);
        if (ll > best.ll) best = { alpha, beta, ll };
      }
    }
  };

  search(0.01, 0.30, 0.50, 0.98, 20);
  search(
    Math.max(0.001, best.alpha - 0.03),
    best.alpha + 0.03,
    Math.max(0, best.beta - 0.05),
    Math.min(0.99, best.beta + 0.05),
    12,
  );
  search(
    Math.max(0.001, best.alpha - 0.005),
    best.alpha + 0.005,
    Math.max(0, best.beta - 0.008),
    Math.min(0.995, best.beta + 0.008),
    10,
  );

  const { alpha, beta } = best;
  const omega = uncondVar * (1 - alpha - beta);
  const { sigma, nextVar, ll } = garchLogLik(returns, omega, alpha, beta, uncondVar);

  const persistence = alpha + beta;
  // A fit that ran to the edge of the search box, or produced no likelihood at
  // all, has not found an interior optimum — treat it as unconverged.
  const converged =
    Number.isFinite(ll) &&
    persistence < MAX_PERSISTENCE - 1e-6 &&
    alpha > 0.0015 &&
    sigma.every((s) => Number.isFinite(s) && s > 0);

  if (!converged) {
    const ewma = ewmaSigma(returns);
    return {
      omega,
      alpha,
      beta,
      sigma: ewma,
      lastSigma: ewma[ewma.length - 1] ?? Math.sqrt(uncondVar),
      longRunSigma: Math.sqrt(uncondVar),
      persistence,
      converged: false,
      method: 'ewma',
    };
  }

  return {
    omega,
    alpha,
    beta,
    sigma,
    lastSigma: Math.sqrt(nextVar),
    longRunSigma: Math.sqrt(uncondVar),
    persistence,
    converged: true,
    method: 'garch',
  };
}

/**
 * Expected sigma for each of the next `horizon` steps.
 *
 * GARCH mean-reverts: `E[sigma^2_{t+h}] = sigma_LR^2 + persistence^(h-1) * (sigma^2_{t+1} - sigma_LR^2)`.
 * That is the point of using it here. Scaling today's volatility by `sqrt(t)` —
 * the textbook shortcut — assumes volatility never changes, so a forecast made
 * on a calm day stays implausibly calm for a year and one made mid-crash stays
 * implausibly violent. This path decays toward the long-run level instead.
 *
 * Returned as sigma (not variance), length `horizon`.
 */
export function forecastSigmaPath(fit: GarchFit, horizon: number): number[] {
  const lrVar = fit.longRunSigma ** 2;
  const startVar = fit.lastSigma ** 2;
  const out: number[] = [];

  for (let h = 1; h <= horizon; h += 1) {
    const v = lrVar + fit.persistence ** (h - 1) * (startVar - lrVar);
    out.push(Math.sqrt(Math.max(v, 1e-12)));
  }
  return out;
}
