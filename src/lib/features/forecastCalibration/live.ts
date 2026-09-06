/**
 * Walk-forward calibration backtest.
 *
 * The distribution page draws a confident-looking cone. This page is what makes
 * it worth believing — or exposes that it is not. For a hundred-odd historical
 * origins it asks the model to predict forward without seeing the answer, then
 * checks whether reality landed inside the bands as often as they claimed.
 *
 * ## Why it is genuinely out-of-sample
 *
 * The GARCH parameters and the residual pool are fitted **once, on a training
 * prefix**, and every scored origin sits after that prefix. Refitting at each
 * origin would be the textbook ideal, but a grid search over the full series at
 * every one of a hundred origins takes far too long to render behind. Fitting on
 * a prefix instead costs one fit and leaks nothing: no origin's own future
 * touches the parameters that predict it.
 *
 * What each origin *does* get is its own volatility state — the variance
 * recursion is run forward through the whole series once, so origin `i` starts
 * from the conditional sigma that was actually observable on day `i`.
 *
 * ## What is measured
 *
 * - **Coverage** — did the 50/80/90% bands contain the outcome that often?
 * - **PIT** — the predictive CDF evaluated at each outcome. A calibrated model
 *   produces a flat histogram. A U shape means bands too narrow; a hump means
 *   too wide.
 * - **Pinball loss** — sharpness, so a model cannot win by being uselessly wide.
 *
 * FHS and plain i.i.d. are both scored, side by side. If the sophisticated
 * engine does not actually beat the simple one, that shows up here.
 */
import { getDailyHistory, getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { fitGarch11 } from '@/lib/quant/garch';
import { simulate, type BootstrapMethod } from '@/lib/quant/fhs';
import { HORIZON_SPEC, FORECAST_HORIZONS } from '@/lib/nav';
import { dateSeed } from '@/lib/rng';
import type {
  CalibrationArgs,
  CalibrationData,
  CoverageRow,
  MethodScore,
  PitBin,
} from './types';

/** Share of history reserved for fitting and never scored. */
const TRAIN_FRACTION = 0.4;
/** Origins to evaluate. More is better statistics and slower rendering. */
const TARGET_ORIGINS = 110;
const PIT_BINS = 10;

/** Bands scored, as [lowerQuantile, upperQuantile, nominalPct]. */
const BANDS: [number, number, number][] = [
  [0.25, 0.75, 50],
  [0.1, 0.9, 80],
  [0.05, 0.95, 90],
];

const QUANTILE_LADDER = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

/** Pinball (quantile) loss for one prediction. */
function pinball(actual: number, predicted: number, q: number): number {
  const d = actual - predicted;
  return d >= 0 ? q * d : (q - 1) * d;
}

interface OriginResult {
  /** Realised gross multiplier over the horizon. */
  actual: number;
  /** Predicted multipliers at `QUANTILE_LADDER`. */
  predicted: number[];
  /** Predictive CDF evaluated at the outcome, in [0,1]. */
  pit: number;
}

function scoreMethod(
  method: BootstrapMethod,
  logReturns: number[],
  closes: number[],
  sigmaSeries: number[],
  fit: ReturnType<typeof fitGarch11>,
  trainEnd: number,
  horizon: number,
  nPaths: number,
  seed: number,
): OriginResult[] {
  const results: OriginResult[] = [];

  // `logReturns[i]` is the return into `closes[i + 1]`, so an origin at return
  // index `i` sits at price index `i + 1`.
  const lastOrigin = logReturns.length - horizon - 1;
  if (lastOrigin <= trainEnd) return results;

  const stride = Math.max(1, Math.floor((lastOrigin - trainEnd) / TARGET_ORIGINS));

  for (let i = trainEnd; i <= lastOrigin; i += stride) {
    const priceIdx = i + 1;
    const from = closes[priceIdx];
    const to = closes[priceIdx + horizon];
    if (!(from > 0) || !(to > 0)) continue;

    const surface = simulate({
      // Only history the origin could have seen.
      returns: logReturns.slice(0, i + 1),
      horizonDays: horizon,
      nPaths,
      seed: seed + i,
      method,
      driftMode: 'zero',
      quantiles: QUANTILE_LADDER,
      fit,
      startSigma: sigmaSeries[i] ?? fit.lastSigma,
      terminalOnly: true,
    });

    const actual = to / from;
    const predicted = surface.bands[horizon];
    if (!predicted || predicted.length !== QUANTILE_LADDER.length) continue;

    // PIT: where the outcome falls in the simulated distribution.
    const t = surface.terminal;
    let lo = 0;
    let hi = t.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid] < actual) lo = mid + 1;
      else hi = mid;
    }

    results.push({ actual, predicted, pit: t.length > 0 ? lo / t.length : 0.5 });
  }

  return results;
}

export async function fetchForecastCalibration({
  horizonDays = 30,
  nPaths = 600,
}: CalibrationArgs) {
  let candles;
  try {
    candles = await getDailyHistory(10, 'BTC-USD');
  } catch {
    try {
      candles = await krakenCandles('1d', 'XBTUSD');
    } catch {
      try {
        candles = await coinbaseCandles('1d', 300, 'BTC-USD');
      } catch {
        return null;
      }
    }
  }

  const closes = candles.map((c) => c.close).filter((c) => c > 0);
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const r = Math.log(closes[i] / closes[i - 1]);
    if (Number.isFinite(r)) logReturns.push(r);
  }

  const horizon = Math.max(1, Math.floor(horizonDays));
  const trainEnd = Math.floor(logReturns.length * TRAIN_FRACTION);

  // A backtest needs enough test period left to produce meaningful origins.
  if (logReturns.length - trainEnd - horizon < 25) return null;

  // One fit, on the training prefix only.
  const fit = fitGarch11(logReturns.slice(0, trainEnd));

  // Conditional sigma observable at each day, carried forward with the fitted
  // parameters. This is what gives every origin its own volatility state.
  const sigmaSeries: number[] = new Array(logReturns.length);
  let v = fit.longRunSigma ** 2;
  for (let i = 0; i < logReturns.length; i += 1) {
    sigmaSeries[i] = Math.sqrt(Math.max(v, 1e-16));
    v = fit.omega + fit.alpha * logReturns[i] ** 2 + fit.beta * v;
  }

  const seed = dateSeed(`calibration_${horizon}`);
  const primaryMethod: BootstrapMethod = 'fhs';

  const run = (m: BootstrapMethod) =>
    scoreMethod(m, logReturns, closes, sigmaSeries, fit, trainEnd, horizon, nPaths, seed);

  const primary = run(primaryMethod);
  if (primary.length < 10) return null;

  // Coverage.
  const qIndex = (q: number) => QUANTILE_LADDER.indexOf(q);
  const coverage: CoverageRow[] = BANDS.map(([loQ, hiQ, nominalPct]) => {
    const li = qIndex(loQ);
    const hi = qIndex(hiQ);
    let inside = 0;
    for (const r of primary) {
      if (r.actual >= r.predicted[li] && r.actual <= r.predicted[hi]) inside += 1;
    }
    const empiricalPct = (inside / primary.length) * 100;
    const gap = empiricalPct - nominalPct;
    return {
      nominalPct,
      empiricalPct,
      windows: primary.length,
      // Seven points of slack: with roughly a hundred origins the sampling error
      // on a coverage estimate is already several points, so a tighter band
      // would flag noise as miscalibration.
      verdict: gap < -7 ? 'NARROW' : gap > 7 ? 'WIDE' : 'GOOD',
    };
  });

  // PIT histogram.
  const counts = new Array(PIT_BINS).fill(0);
  for (const r of primary) {
    const idx = Math.min(PIT_BINS - 1, Math.max(0, Math.floor(r.pit * PIT_BINS)));
    counts[idx] += 1;
  }
  const expected = primary.length / PIT_BINS;
  const pitHistogram: PitBin[] = counts.map((count, i) => ({
    binLow: i / PIT_BINS,
    binHigh: (i + 1) / PIT_BINS,
    count,
    expected,
  }));

  // Uniformity as a 0-100 score: total absolute deviation from flat, normalised
  // by the worst case (everything in one bin).
  const deviation = counts.reduce((s, c) => s + Math.abs(c - expected), 0);
  const worst = 2 * (primary.length - expected);
  const pitUniformityScore =
    worst > 0 ? Math.max(0, Math.min(100, (1 - deviation / worst) * 100)) : 100;

  // Shape: compare the two outer bins against the two central ones.
  const edges = counts[0] + counts[PIT_BINS - 1];
  const centre = counts[PIT_BINS / 2 - 1] + counts[PIT_BINS / 2];
  const half = Math.floor(PIT_BINS / 2);
  const lower = counts.slice(0, half).reduce((s, c) => s + c, 0);
  const upper = counts.slice(half).reduce((s, c) => s + c, 0);
  let pitShape: CalibrationData['pitShape'] = 'FLAT';
  if (Math.abs(lower - upper) > primary.length * 0.25) pitShape = 'SKEWED';
  else if (edges > centre * 1.6) pitShape = 'U-SHAPED';
  else if (centre > edges * 1.6) pitShape = 'HUMPED';

  // Method comparison.
  const scoreOf = (rs: OriginResult[]): { coverage80: number; pinball: number } => {
    if (rs.length === 0) return { coverage80: 0, pinball: 0 };
    const li = qIndex(0.1);
    const hi = qIndex(0.9);
    let inside = 0;
    let loss = 0;
    for (const r of rs) {
      if (r.actual >= r.predicted[li] && r.actual <= r.predicted[hi]) inside += 1;
      for (let k = 0; k < QUANTILE_LADDER.length; k += 1) {
        loss += pinball(r.actual, r.predicted[k], QUANTILE_LADDER[k]);
      }
    }
    return {
      coverage80: (inside / rs.length) * 100,
      pinball: loss / (rs.length * QUANTILE_LADDER.length),
    };
  };

  const iid = run('iid');
  const comparison: MethodScore[] = [
    { method: 'fhs', label: 'Filtered historical', ...scoreOf(primary) },
    { method: 'iid', label: 'Independent resample', ...scoreOf(iid) },
  ];

  const horizonKey =
    FORECAST_HORIZONS.find((k) => HORIZON_SPEC[k].days === horizon) ?? '1M';

  const data: CalibrationData = {
    horizonDays: horizon,
    horizonLabel: HORIZON_SPEC[horizonKey].label,
    origins: primary.length,
    trainDays: trainEnd,
    testDays: logReturns.length - trainEnd,
    coverage,
    pitHistogram,
    pitUniformityScore,
    pitShape,
    comparison,
    primaryMethod,
  };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
