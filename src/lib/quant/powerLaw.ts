/**
 * Power-law corridor — the "rainbow chart", made checkable. Pure, no I/O.
 *
 * Model: log10(price) = a + b·log10(days since genesis). Every month the line
 * is refitted on data BEFORE that month only, and each day of the month gets a
 * percentile 0–100: the share of all past residuals at or below today's. So
 * the position on any day uses only what was known that day — the classic
 * rainbow chart is fitted on everything and re-drawn after the fact. A new
 * month's data triggers a new fit by itself.
 *
 * Port of research/BTC_Halving_Cycle_PowerLaw.ipynb §2.2 (the zone and
 * band-touch tests of §2.3 stay in the notebook). Parity: `powerLaw.test.ts`.
 */
import { GENESIS, PL_WF_START, QUANTS, ZONE_EDGES } from './config';
import { isoDay, lastDay, monthStarts, toDay, type DailySeries } from './daily';

const GENESIS_DAY = toDay(GENESIS);

export const ZONES = ['Sangat murah', 'Murah', 'Wajar', 'Mahal', 'Sangat mahal'] as const;
export type Zone = (typeof ZONES)[number];

/** Zone of a 0–100 percentile, cut at `ZONE_EDGES`. */
export function zoneOf(pct: number): Zone {
  const i = ZONE_EDGES.findIndex((e) => pct < e);
  return ZONES[i === -1 ? ZONES.length - 1 : i];
}

export interface PowerLawFit {
  /** First day this fit was used (month start); fitted on every day before it. */
  refit: string;
  a: number;
  b: number;
  /** Residual quantiles at QUANTS (log10 units), numpy's default linear interpolation. */
  residQ: number[];
}

/** numpy `quantile` default (type 7) on a sorted array. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Count of `sorted` values ≤ x (numpy `searchsorted(side="right")`). */
function upperBound(sorted: Float64Array, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface WalkForward {
  /** Series index of `pct[0]`. */
  offset: number;
  /** Walk-forward corridor percentile, one per day from the first refit to the last day. */
  pct: number[];
  fits: PowerLawFit[];
}

export function walkForward(s: DailySeries): WalkForward {
  const n = s.prices.length;
  const x = s.prices.map((_, i) => Math.log10(s.start + i - GENESIS_DAY));
  const y = s.prices.map((p) => Math.log10(p));
  const refits = monthStarts(Math.max(toDay(PL_WF_START), s.start + 2), lastDay(s));
  const offset = refits.length ? refits[0] - s.start : n;
  const pct: number[] = [];
  const fits: PowerLawFit[] = [];

  refits.forEach((R, k) => {
    const m = R - s.start; // days [0, m) are "before R"
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < m; i += 1) {
      sx += x[i];
      sy += y[i];
    }
    const mx = sx / m;
    const my = sy / m;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < m; i += 1) {
      sxx += (x[i] - mx) ** 2;
      sxy += (x[i] - mx) * (y[i] - my);
    }
    const b = sxy / sxx;
    const a = my - b * mx;
    const resid = new Float64Array(m);
    for (let i = 0; i < m; i += 1) resid[i] = y[i] - (a + b * x[i]);
    resid.sort();
    const end = k + 1 < refits.length ? refits[k + 1] - s.start : n;
    for (let i = m; i < end; i += 1) pct.push((upperBound(resid, y[i] - (a + b * x[i])) / m) * 100);
    fits.push({ refit: isoDay(R), a, b, residQ: QUANTS.map((q) => quantileSorted(resid, q)) });
  });
  return { offset, pct, fits };
}

/** Price of band `q` (index into QUANTS) on `day`, from one fit. */
export function bandPrice(fit: PowerLawFit, day: number, qIndex: number): number {
  return 10 ** (fit.a + fit.b * Math.log10(Math.floor(day) - GENESIS_DAY) + fit.residQ[qIndex]);
}

export const bandsAt = (fit: PowerLawFit, day: number) => QUANTS.map((_, i) => bandPrice(fit, day, i));
