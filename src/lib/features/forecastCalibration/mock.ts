import { dateSeed, mulberry32 } from '@/lib/rng';
import { FORECAST_HORIZONS, HORIZON_SPEC } from '@/lib/nav';
import type { CalibrationArgs, CalibrationData, CoverageRow, PitBin } from './types';

const PIT_BINS = 10;
const ORIGINS = 108;

export function mockForecastCalibration({
  horizonDays = 30,
}: CalibrationArgs): CalibrationData {
  const rand = mulberry32(dateSeed('forecastCalibration'));
  const horizon = Math.max(1, Math.floor(horizonDays));

  // A model that is close to calibrated but very slightly overconfident — the
  // realistic case, and more useful as a placeholder than a perfect one.
  const coverage: CoverageRow[] = [50, 80, 90].map((nominalPct) => {
    const empiricalPct = nominalPct - 2 - rand() * 4;
    const gap = empiricalPct - nominalPct;
    return {
      nominalPct,
      empiricalPct,
      windows: ORIGINS,
      verdict: gap < -7 ? 'NARROW' : gap > 7 ? 'WIDE' : 'GOOD',
    };
  });

  const expected = ORIGINS / PIT_BINS;
  const pitHistogram: PitBin[] = Array.from({ length: PIT_BINS }, (_, i) => {
    // Very gentle U — slightly too much mass in the tails.
    const edge = Math.abs(i - (PIT_BINS - 1) / 2) / ((PIT_BINS - 1) / 2);
    const count = Math.round(expected * (0.88 + edge * 0.28 + (rand() - 0.5) * 0.18));
    return { binLow: i / PIT_BINS, binHigh: (i + 1) / PIT_BINS, count, expected };
  });

  const deviation = pitHistogram.reduce((s, b) => s + Math.abs(b.count - expected), 0);
  const worst = 2 * (ORIGINS - expected);
  const pitUniformityScore =
    worst > 0 ? Math.max(0, Math.min(100, (1 - deviation / worst) * 100)) : 100;

  const horizonKey =
    FORECAST_HORIZONS.find((k) => HORIZON_SPEC[k].days === horizon) ?? '1M';

  return {
    horizonDays: horizon,
    horizonLabel: HORIZON_SPEC[horizonKey].label,
    origins: ORIGINS,
    trainDays: 1560,
    testDays: 2340,
    coverage,
    pitHistogram,
    pitUniformityScore,
    pitShape: 'FLAT',
    comparison: [
      {
        method: 'fhs',
        label: 'Filtered historical',
        coverage80: 77.8,
        pinball: 0.0271,
      },
      {
        method: 'iid',
        label: 'Independent resample',
        coverage80: 72.4,
        pinball: 0.0298,
      },
    ],
    primaryMethod: 'fhs',
  };
}
