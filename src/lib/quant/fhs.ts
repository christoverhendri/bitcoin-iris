/**
 * Price-distribution simulation.
 *
 * Three resampling engines behind one interface, so the calibration page can run
 * them against each other rather than asking anyone to take the choice on faith:
 *
 *   fhs         Filtered Historical Simulation. Fit GARCH, divide the returns by
 *               their conditional sigma, resample those standardised residuals,
 *               then re-inflate through the GARCH recursion path by path. Keeps
 *               volatility clustering AND the empirical fat tails, and assumes no
 *               distributional form at all. This is the industry-standard VaR
 *               construction and the default here.
 *
 *   stationary  Politis-Romano stationary bootstrap. Resamples blocks of
 *               geometric length with wrap-around, preserving autocorrelation and
 *               momentum in the raw return series.
 *
 *   iid         Plain independent resampling. Kept deliberately: it is what the
 *               terminal used to do, and it is the baseline the other two have to
 *               beat on the calibration page. Its tails are too thin because
 *               independent draws destroy volatility clustering.
 *
 * ## Drift
 *
 * `driftMode: 'zero'` subtracts the sample mean from the returns before anything
 * else. This matters more than any other choice in this file. Ten years of BTC
 * carries an enormous positive drift — the sample starts near $430 — and letting
 * it through would tilt every cone upward by an amount that reflects nothing but
 * which decade the data came from. With drift removed, the median lands on spot
 * and the output is a **distribution of risk**, not a directional forecast.
 *
 * ## Memory
 *
 * Full paths are never retained. Only the current cumulative log return per path
 * (plus the per-path variance state for FHS) is carried forward; each step's
 * quantiles are taken and the level discarded. Peak memory is O(nPaths), not
 * O(nPaths x horizon) — a 5000 x 365 grid would be 1.8M floats for no benefit.
 *
 * Pure and seeded throughout: same config in, byte-identical surface out.
 */
import { mulberry32 } from '@/lib/rng';
import { fitGarch11, type GarchFit } from './garch';

export type BootstrapMethod = 'fhs' | 'stationary' | 'iid';
export type DriftMode = 'zero' | 'historical';

export interface SimulationConfig {
  /** Daily log returns, oldest first. */
  returns: number[];
  horizonDays: number;
  nPaths: number;
  seed: number;
  method: BootstrapMethod;
  driftMode: DriftMode;
  /** Ascending, in (0,1). Defaults to the seven-band ladder below. */
  quantiles?: number[];
  /** Stationary bootstrap only. Expected block length in days. */
  meanBlockLength?: number;
  /**
   * Step at which to record the full sorted cross-section into `terminal`.
   * Defaults to the final step.
   *
   * This is what lets one long run serve every horizon: simulate to the longest
   * horizon once, read the shorter horizons off the intermediate band rows, and
   * capture the path-level distribution at whichever horizon is on screen. Six
   * separate runs would cost six times as much and — worse — the 1M row and the
   * 1Y row would come from different random draws, so the table could disagree
   * with itself.
   */
  captureStep?: number;
  /**
   * Reuse an already-fitted GARCH instead of fitting one.
   *
   * A walk-forward backtest evaluates a hundred-odd origins; refitting at each
   * costs a grid search over the whole series every time and makes the page
   * unusable. Fitting once on a training prefix and passing it here keeps the
   * evaluation genuinely out-of-sample while running in milliseconds.
   */
  fit?: GarchFit;
  /**
   * Conditional sigma to start the paths from, overriding the fit's own last
   * value. This is how a backtest origin gets *its* volatility state rather than
   * today's.
   */
  startSigma?: number;
  /**
   * Skip per-step quantiles and produce only the cross-section at the end.
   * The per-step sort dominates the cost, and a backtest never looks at the
   * intermediate rows.
   */
  terminalOnly?: boolean;
}

export interface QuantileSurface {
  /** `bands[step][q]` — gross multiplier vs spot. `bands[0]` is all 1. */
  bands: number[][];
  quantiles: number[];
  /**
   * Every path's multiplier at `capturedAtStep`, ascending. Feeds the histogram
   * and `probAbove`.
   */
  terminal: number[];
  /** Step the `terminal` cross-section was taken at. */
  capturedAtStep: number;
  horizonDays: number;
  method: BootstrapMethod;
  driftMode: DriftMode;
  /** Expected sigma per step — for display, not used to drive the paths. */
  sigmaPath: number[];
  garchConverged: boolean;
  /** Conditional sigma for the next step, daily. */
  sigmaNow: number;
  /** Unconditional sigma the process reverts to, daily. */
  sigmaLongRun: number;
  /** Sample mean removed when `driftMode` is 'zero'. Zero otherwise. */
  driftRemoved: number;
}

export const DEFAULT_QUANTILES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

/** Linear-interpolated quantile of an already-sorted ascending array. */
function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n - 1);
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

/** A flat surface, returned when there is nothing to simulate. */
function degenerate(cfg: SimulationConfig, quantiles: number[]): QuantileSurface {
  const steps = Math.max(0, cfg.horizonDays);
  return {
    bands: Array.from({ length: steps + 1 }, () => quantiles.map(() => 1)),
    quantiles,
    terminal: new Array(Math.max(1, cfg.nPaths)).fill(1),
    capturedAtStep: steps,
    horizonDays: steps,
    method: cfg.method,
    driftMode: cfg.driftMode,
    sigmaPath: new Array(steps).fill(0),
    garchConverged: false,
    sigmaNow: 0,
    sigmaLongRun: 0,
    driftRemoved: 0,
  };
}

export function simulate(cfg: SimulationConfig): QuantileSurface {
  const quantiles = cfg.quantiles ?? DEFAULT_QUANTILES;
  const horizon = Math.max(0, Math.floor(cfg.horizonDays));
  const nPaths = Math.max(1, Math.floor(cfg.nPaths));

  if (cfg.returns.length < 30 || horizon === 0) return degenerate(cfg, quantiles);

  // Drift handling happens first, so every engine below sees the same series.
  const driftRemoved = cfg.driftMode === 'zero' ? mean(cfg.returns) : 0;
  const returns =
    driftRemoved === 0 ? cfg.returns : cfg.returns.map((r) => r - driftRemoved);

  const rand = mulberry32(cfg.seed);

  // GARCH is fitted for every method: FHS needs it to drive the paths, and the
  // others still report the volatility state on the panel. A caller running many
  // simulations off one fit passes it in.
  const fit: GarchFit = cfg.fit ?? fitGarch11(returns);

  // Standardised residuals. Under FHS these are the pool we resample from — the
  // filtering is what makes them close enough to i.i.d. for that to be honest.
  const residuals: number[] = [];
  for (let i = 0; i < returns.length; i += 1) {
    const s = fit.sigma[i];
    if (!(s > 0) || !Number.isFinite(s)) continue;
    const z = returns[i] / s;
    if (Number.isFinite(z)) residuals.push(z);
  }

  const pool = cfg.method === 'fhs' && residuals.length >= 30 ? residuals : returns;
  const usingFhs = cfg.method === 'fhs' && pool === residuals;

  // Per-path state. Nothing else is retained across steps.
  const cum = new Float64Array(nPaths); // cumulative log return
  const pathVar = new Float64Array(nPaths); // FHS variance recursion
  const blockIdx = new Int32Array(nPaths); // stationary bootstrap cursor
  const startSigma = cfg.startSigma !== undefined && cfg.startSigma > 0
    ? cfg.startSigma
    : fit.lastSigma;
  const startVar = startSigma ** 2;

  for (let p = 0; p < nPaths; p += 1) {
    pathVar[p] = startVar;
    blockIdx[p] = Math.floor(rand() * pool.length);
  }

  const anchor = quantiles.map(() => 1);
  // A terminal-only run still returns a full-length `bands`, pre-filled with the
  // anchor row, so consumers can index it without tripping over holes. Only the
  // captured step and the final step carry real quantiles.
  const bands: number[][] = cfg.terminalOnly
    ? Array.from({ length: horizon + 1 }, () => anchor)
    : [anchor];
  const scratch = new Float64Array(nPaths);

  const captureStep = Math.min(
    horizon,
    Math.max(1, Math.floor(cfg.captureStep ?? horizon)),
  );
  let captured: number[] | null = null;

  // Expected block length -> geometric continuation probability.
  const blockP = 1 / Math.max(2, cfg.meanBlockLength ?? 20);

  for (let step = 1; step <= horizon; step += 1) {
    for (let p = 0; p < nPaths; p += 1) {
      let r: number;

      if (usingFhs) {
        const z = pool[Math.floor(rand() * pool.length)];
        const sigma = Math.sqrt(Math.max(pathVar[p], 1e-16));
        r = sigma * z;
        // Advance this path's own volatility state, which is what reproduces
        // clustering: a large shock here makes the next step more volatile.
        pathVar[p] = fit.omega + fit.alpha * r * r + fit.beta * pathVar[p];
      } else if (cfg.method === 'stationary') {
        // Continue the current block, or jump to a fresh random start.
        if (rand() < blockP) blockIdx[p] = Math.floor(rand() * pool.length);
        else blockIdx[p] = (blockIdx[p] + 1) % pool.length;
        r = pool[blockIdx[p]];
      } else {
        r = pool[Math.floor(rand() * pool.length)];
      }

      cum[p] += r;
      scratch[p] = cum[p];
    }

    // The per-step sort dominates the cost. A terminal-only run skips it except
    // at the step it actually needs.
    const needSort = !cfg.terminalOnly || step === captureStep || step === horizon;
    if (!needSort) continue;

    const sorted = Array.from(scratch).sort((a, b) => a - b);
    const row = quantiles.map((q) => Math.exp(quantileSorted(sorted, q)));
    if (cfg.terminalOnly) bands[step] = row;
    else bands.push(row);

    // The sort is already paid for; reuse it rather than re-sorting later.
    if (step === captureStep) captured = sorted.map((c) => Math.exp(c));
  }

  const terminal =
    captured ??
    Array.from(cum)
      .map((c) => Math.exp(c))
      .sort((a, b) => a - b);

  // Display-only expected volatility path. The simulation itself uses the
  // per-path recursion above, not this.
  const lrVar = fit.longRunSigma ** 2;
  const sigmaPath: number[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    sigmaPath.push(
      Math.sqrt(Math.max(lrVar + fit.persistence ** (h - 1) * (startVar - lrVar), 1e-16)),
    );
  }

  return {
    bands,
    quantiles,
    terminal,
    capturedAtStep: captureStep,
    horizonDays: horizon,
    method: cfg.method,
    driftMode: cfg.driftMode,
    sigmaPath,
    garchConverged: fit.converged,
    sigmaNow: fit.lastSigma,
    sigmaLongRun: fit.longRunSigma,
    driftRemoved,
  };
}

/**
 * Share of simulated paths ending at or above `multiplier` (gross, vs spot).
 * Binary search over the sorted terminal array.
 */
export function probAbove(surface: QuantileSurface, multiplier: number): number {
  const t = surface.terminal;
  const n = t.length;
  if (n === 0) return 0;

  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < multiplier) lo = mid + 1;
    else hi = mid;
  }
  return (n - lo) / n;
}

/** Terminal multipliers binned for a histogram, ascending by price. */
export function terminalHistogram(
  surface: QuantileSurface,
  spot: number,
  bins = 28,
): { binLow: number; binHigh: number; count: number }[] {
  const t = surface.terminal;
  if (t.length === 0 || bins < 1) return [];

  // Clip to the 1st/99th percentile so a single runaway path does not squash
  // every meaningful bin into the leftmost column.
  const lo = quantileSorted(t, 0.01) * spot;
  const hi = quantileSorted(t, 0.99) * spot;
  const width = (hi - lo) / bins;
  if (!(width > 0)) return [];

  const counts = new Array(bins).fill(0);
  for (const m of t) {
    const price = m * spot;
    const idx = Math.floor((price - lo) / width);
    if (idx < 0 || idx >= bins) continue;
    counts[idx] += 1;
  }

  return counts.map((count, i) => ({
    binLow: lo + i * width,
    binHigh: lo + (i + 1) * width,
    count,
  }));
}
