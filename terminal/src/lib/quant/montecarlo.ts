/**
 * Bootstrap Monte Carlo for price-path forecasting.
 *
 * Pure and deterministic given `seed` — no `Date.now`, no `Math.random`. The
 * caller seeds it off the UTC day (`dateSeed`) so SSR and client hydration
 * produce the same numbers.
 *
 * Method: resample observed daily log returns with replacement. Each simulated
 * path walks `horizonDays` steps, drawing one historical log return per step and
 * accumulating it. The terminal cumulative return of every path is collected and
 * sorted; p10/p50/p90 are read off that distribution and returned as GROSS
 * MULTIPLIERS (`exp(cum)`), so `spot * p50` is the median projected price.
 */
import { mulberry32 } from '@/lib/rng';

export interface BootstrapResult {
  /** 10th percentile terminal multiplier (exp of cumulative log return). */
  p10: number;
  /** Median terminal multiplier. */
  p50: number;
  /** 90th percentile terminal multiplier. */
  p90: number;
  /**
   * The mean simulated position at each step, expressed as percent from spot:
   * `(exp(mean cumulative log return at t) - 1) * 100`. Length `horizonDays + 1`,
   * first element is `0`.
   */
  medianPathPct: number[];
}

export function bootstrapPaths(
  logReturns: number[],
  horizonDays: number,
  nPaths: number,
  seed: number,
): BootstrapResult {
  if (logReturns.length === 0 || horizonDays <= 0 || nPaths <= 0) {
    return { p10: 1, p50: 1, p90: 1, medianPathPct: new Array(Math.max(1, horizonDays + 1)).fill(0) };
  }

  const rand = mulberry32(seed);
  const n = logReturns.length;

  const terminals: number[] = new Array(nPaths);
  // Running sum of cumulative log return across paths, per step, for the mean path.
  const cumSumByStep = new Array(horizonDays + 1).fill(0);

  for (let p = 0; p < nPaths; p++) {
    let cum = 0;
    for (let t = 1; t <= horizonDays; t++) {
      const i = Math.floor(rand() * n);
      cum += logReturns[i < n ? i : n - 1];
      cumSumByStep[t] += cum;
    }
    terminals[p] = cum;
  }

  terminals.sort((a, b) => a - b);
  const at = (q: number) => terminals[Math.min(nPaths - 1, Math.floor(nPaths * q))];

  const medianPathPct = cumSumByStep.map((s) => (Math.exp(s / nPaths) - 1) * 100);
  medianPathPct[0] = 0;

  return {
    p10: Math.exp(at(0.1)),
    p50: Math.exp(at(0.5)),
    p90: Math.exp(at(0.9)),
    medianPathPct,
  };
}
