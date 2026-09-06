import { fmtPct, fmtUsd } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';
import type { HorizonBand, PriceDistributionData } from './types';

/**
 * The sentence that has to sit on this page. Everything else here is formatting;
 * this is the part that stops the chart being read as a prediction.
 */
export const DISTRIBUTION_NOTE =
  'This is a distribution of outcomes, not a forecast of direction. Drift is ' +
  'removed before simulating, so the median sits on spot by construction — the ' +
  'cone describes how far price could travel, and says nothing about which way ' +
  'it will go.';

export const METHOD_NOTE =
  'Filtered Historical Simulation: a GARCH(1,1) filter estimates today’s ' +
  'conditional volatility, returns are divided by it to leave standardised ' +
  'residuals, those residuals are resampled, and each path is re-inflated ' +
  'through its own volatility recursion. That keeps both volatility clustering ' +
  'and the real shape of the tails, without assuming any distribution. Plain ' +
  'independent resampling — what this terminal used to do — destroys the ' +
  'clustering and produces tails that are too thin.';

export const SAMPLE_NOTE =
  'A band is only as trustworthy as the number of independent samples behind ' +
  'it. The WINDOWS column counts non-overlapping periods of each length in the ' +
  'history: a one-year band drawn from a decade rests on about ten. Short ' +
  'horizons are well sampled; the long ones are indicative.';

export const DVOL_COMPARE_NOTE =
  'DVOL is Deribit’s 30-day implied volatility — what option buyers are paying ' +
  'for future movement. The model’s figure is realised volatility carried ' +
  'forward. Implied above realised means the market expects more movement than ' +
  'has recently occurred; the gap is a risk premium, not an error in either.';

/** Bands are neutral by construction — tone by distance from spot, not by sign. */
export function bandTone(price: number, spot: number): Tone {
  if (spot <= 0) return 'txt';
  const d = (price - spot) / spot;
  if (d > 0.005) return 'up';
  if (d < -0.005) return 'down';
  return 'txt';
}

/**
 * How much weight the sample size supports. Ten non-overlapping windows is thin
 * enough to say so out loud.
 */
export function sampleTone(windows: number): Tone {
  if (windows >= 60) return 'up';
  if (windows >= 20) return 'txt';
  return 'amber';
}

export function sampleVerdict(windows: number): string {
  if (windows >= 60) return 'well sampled';
  if (windows >= 20) return 'moderate';
  return 'thin — indicative only';
}

export function fmtProb(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function probTone(p: number): Tone {
  if (p >= 0.66) return 'up';
  if (p <= 0.34) return 'down';
  return 'txt';
}

export function toHorizonRow(b: HorizonBand, spot: number) {
  return {
    key: b.key,
    label: b.label,
    days: b.days,
    p5: fmtUsd(b.p5),
    p25: fmtUsd(b.p25),
    p50: fmtUsd(b.p50),
    p75: fmtUsd(b.p75),
    p95: fmtUsd(b.p95),
    expectedMove: fmtPct(b.expectedMovePct, false, 1),
    range: fmtPct(b.rangePct, false, 1),
    windows: b.nonOverlappingWindows,
    windowsTone: sampleTone(b.nonOverlappingWindows),
    p50Tone: bandTone(b.p50, spot),
  };
}

export function toDistributionLabels(d: PriceDistributionData) {
  return {
    spot: fmtUsd(d.spot),
    horizon: d.horizonLabel,
    sigmaNow: fmtPct(d.sigmaNowAnnualPct, false, 1),
    sigmaLongRun: fmtPct(d.sigmaLongRunAnnualPct, false, 1),
    dvol: d.dvol === null ? '—' : d.dvol.toFixed(1),
    driftRemoved: `${(d.driftRemoved * 100).toFixed(3)}%/day`,
    sampleDays: `${d.sampleDays.toLocaleString('en-US')} days`,
    historyStart: d.historyStart,
    method: d.method.toUpperCase(),
    volState: d.garchConverged ? 'GARCH(1,1)' : 'EWMA fallback',
  };
}
