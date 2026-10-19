/**
 * Forward validation — scoring published forecasts against what happened,
 * after the fact, with rules fixed before the first scored week. Pure.
 *
 * Weekly signal: one prediction per week close, 7-day horizon, so windows never
 * overlap; scored with the training label rule (UP / DOWN / NOISE) by the
 * worker (`iris_worker/forward_validation.py`). NOISE weeks are not counted,
 * exactly as in training and the test-set track record.
 *
 * Monthly runs: issued weekly with a 30-day horizon, so their windows overlap.
 * For horizon h the evaluation series keeps only runs at least h days after the
 * previously kept one (greedy, oldest first): D+7 uses every weekly run, D+14
 * every second, D+28 every fourth — no two scored windows overlap.
 *
 * Nothing here re-predicts or drops a published forecast.
 */

/** Before this many scored samples the page says "too few to conclude". Method parameters, fixed up front. */
export const MIN_WEEKLY_LABELED = 26;
export const MIN_MONTHLY_PER_HORIZON = 12;
export const MONTHLY_HORIZONS = [7, 14, 28] as const;
/** z for a two-sided 90% interval. */
const Z90 = 1.6448536269514722;

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** Wilson score interval for k successes out of n (90%). */
export function wilson(k: number, n: number, z = Z90): [number, number] | null {
  if (n <= 0) return null;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function binomPmf(k: number, n: number, p: number): number {
  let logC = 0;
  for (let i = 1; i <= k; i += 1) logC += Math.log((n - k + i) / i);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** Central 90% range of hits out of n if the true rate is p: what "working as designed" looks like. */
export function expectedHits(n: number, p: number): [number, number] {
  let cdf = 0;
  let lo = 0;
  let hi = n;
  let loSet = false;
  for (let k = 0; k <= n; k += 1) {
    cdf += binomPmf(k, n, p);
    if (!loSet && cdf >= 0.05) {
      lo = k;
      loSet = true;
    }
    if (cdf >= 0.95) {
      hi = k;
      break;
    }
  }
  return [lo, hi];
}

// --- weekly ------------------------------------------------------------------

export interface WeeklyRealized {
  end_date: string;
  close_as_of: number;
  close_end: number;
  return_7d: number;
  label: 'UP' | 'DOWN' | 'NOISE';
  correct: boolean | null;
}

export interface WeeklySignalRow {
  as_of: string;
  signal: 'BULL' | 'BEAR' | 'NONE' | string;
  p_up: number;
  model_created_utc?: string | null;
  realized?: WeeklyRealized | null;
}

export interface WeeklyForward {
  /** First week-close signal: the start of the series. */
  start: string | null;
  published: number;
  /** Published, 7 days not over yet. */
  pending: number;
  scored: number;
  noise: number;
  labeled: number;
  correct: number;
  accuracy: number | null;
  /** 90% interval of the accuracy. */
  accuracyCi: [number, number] | null;
  /** Share of UP among labeled weeks = accuracy of "always BULL" on the same weeks. */
  alwaysBull: number | null;
  bySignal: { signal: 'BULL' | 'BEAR'; n: number; correct: number }[];
  /** Distinct model versions in the series (a retrain starts a new one). */
  models: string[];
  enough: boolean;
  /** Newest first. */
  rows: (WeeklySignalRow & { endDate: string })[];
}

const isSunday = (iso: string) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)).getUTCDay() === 0;

export function weeklyForward(all: readonly WeeklySignalRow[]): WeeklyForward {
  const series = all.filter((r) => isSunday(r.as_of)).sort((a, b) => a.as_of.localeCompare(b.as_of));
  const scored = series.filter((r) => r.realized);
  const labeled = scored.filter((r) => r.realized!.label !== 'NOISE' && (r.signal === 'BULL' || r.signal === 'BEAR'));
  const correct = labeled.filter((r) => r.realized!.correct).length;
  const ups = labeled.filter((r) => r.realized!.label === 'UP').length;
  const bySignal = (['BULL', 'BEAR'] as const).map((signal) => {
    const s = labeled.filter((r) => r.signal === signal);
    return { signal, n: s.length, correct: s.filter((r) => r.realized!.correct).length };
  });
  return {
    start: series[0]?.as_of ?? null,
    published: series.length,
    pending: series.length - scored.length,
    scored: scored.length,
    noise: scored.filter((r) => r.realized!.label === 'NOISE').length,
    labeled: labeled.length,
    correct,
    accuracy: labeled.length ? correct / labeled.length : null,
    accuracyCi: wilson(correct, labeled.length),
    alwaysBull: labeled.length ? ups / labeled.length : null,
    bySignal,
    models: [...new Set(series.map((r) => r.model_created_utc).filter((m): m is string => !!m))],
    enough: labeled.length >= MIN_WEEKLY_LABELED,
    rows: [...series]
      .reverse()
      .map((r) => ({ ...r, endDate: new Date((dayOf(r.as_of) + 7) * DAY_MS).toISOString().slice(0, 10) })),
  };
}

// --- monthly -----------------------------------------------------------------

export interface HorizonOutcome {
  date: string;
  close: number;
  inside80: boolean;
  inside90: boolean;
  bucket: string;
  abs_err_median: number;
}

export interface MonthlyRunOutcome {
  asOf: string;
  /** Keyed by horizon in days ("7", "14", "28"). */
  atH: Record<string, HorizonOutcome | undefined>;
}

export interface MonthlyForwardHorizon {
  h: number;
  /** Runs in the non-overlapping series for this horizon (scored or not). */
  inSeries: number;
  scored: number;
  inside80: number;
  inside90: number;
  /** Hits a correct 80% band would usually give for this many windows (central 90%). */
  expected80: [number, number] | null;
  meanAbsErr: number | null;
  enough: boolean;
  /** Newest first. */
  rows: { asOf: string; outcome: HorizonOutcome | null }[];
}

export interface MonthlyForward {
  start: string | null;
  runs: number;
  horizons: MonthlyForwardHorizon[];
}

/** Greedy non-overlapping pick: oldest first, keep a run when it is ≥ h days after the last kept one. */
export function nonOverlapping<T extends { asOf: string }>(runs: readonly T[], h: number): T[] {
  const out: T[] = [];
  let last = -Infinity;
  for (const r of [...runs].sort((a, b) => a.asOf.localeCompare(b.asOf))) {
    const d = dayOf(r.asOf);
    if (d - last >= h) {
      out.push(r);
      last = d;
    }
  }
  return out;
}

export function monthlyForward(runs: readonly MonthlyRunOutcome[]): MonthlyForward {
  const sorted = [...runs].sort((a, b) => a.asOf.localeCompare(b.asOf));
  return {
    start: sorted[0]?.asOf ?? null,
    runs: sorted.length,
    horizons: MONTHLY_HORIZONS.map((h) => {
      const series = nonOverlapping(sorted, h);
      const done = series.map((r) => r.atH[String(h)]).filter((o): o is HorizonOutcome => !!o);
      const inside80 = done.filter((o) => o.inside80).length;
      return {
        h,
        inSeries: series.length,
        scored: done.length,
        inside80,
        inside90: done.filter((o) => o.inside90).length,
        expected80: done.length ? expectedHits(done.length, 0.8) : null,
        meanAbsErr: done.length ? done.reduce((a, o) => a + o.abs_err_median, 0) / done.length : null,
        enough: done.length >= MIN_MONTHLY_PER_HORIZON,
        rows: [...series].reverse().map((r) => ({ asOf: r.asOf, outcome: r.atH[String(h)] ?? null })),
      };
    }),
  };
}
