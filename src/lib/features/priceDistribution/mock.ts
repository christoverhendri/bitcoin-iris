import { dateSeed, mulberry32, utcDay } from '@/lib/rng';
import { FORECAST_HORIZONS, HORIZON_SPEC } from '@/lib/nav';
import { DEFAULT_QUANTILES } from '@/lib/quant/fhs';
import type {
  HistogramBin,
  HorizonBand,
  PriceDistributionArgs,
  PriceDistributionData,
} from './types';

const DAY_MS = 86_400_000;
const MAX_HORIZON = 365;
const SPOT = 78_000;
/** Daily sigma implying roughly 45% annualised — a plausible BTC regime. */
const DAILY_SIGMA = 0.0235;
const SAMPLE_DAYS = 3800;

/** Standard-normal quantiles for the seven bands the real engine publishes. */
const Z: Record<number, number> = {
  0.05: -1.6449,
  0.1: -1.2816,
  0.25: -0.6745,
  0.5: 0,
  0.75: 0.6745,
  0.9: 1.2816,
  0.95: 1.6449,
};

export function mockPriceDistribution({
  horizonDays = 30,
}: PriceDistributionArgs): PriceDistributionData {
  const rand = mulberry32(dateSeed('priceDistribution'));
  // Seeded off the UTC day, never `Date.now()`, so SSR and hydration agree.
  const anchor = Date.parse(`${utcDay()}T00:00:00.000Z`);
  const horizon = Math.max(1, Math.min(MAX_HORIZON, Math.floor(horizonDays)));

  // A lognormal fan, widening with sqrt(t) — the shape the real engine produces
  // when volatility happens to sit at its long-run level. Centred on 1 because
  // the live path removes drift, and the mock must not imply otherwise.
  const multiplier = (step: number, q: number) =>
    Math.exp(Z[q] * DAILY_SIGMA * Math.sqrt(step));

  const bandsFull: number[][] = [];
  for (let step = 0; step <= MAX_HORIZON; step += 1) {
    bandsFull.push(DEFAULT_QUANTILES.map((q) => multiplier(step, q)));
  }

  const termStructure: HorizonBand[] = FORECAST_HORIZONS.map((key) => {
    const { days, label } = HORIZON_SPEC[key];
    const row = bandsFull[days];
    const px = (i: number) => row[i] * SPOT;
    const p25 = px(2);
    const p75 = px(4);
    return {
      key,
      days,
      label,
      p5: px(0),
      p10: px(1),
      p25,
      p50: px(3),
      p75,
      p90: px(5),
      p95: px(6),
      expectedMovePct: ((p75 - p25) / 2 / SPOT) * 100,
      rangePct: ((px(6) - px(0)) / SPOT) * 100,
      nonOverlappingWindows: Math.floor(SAMPLE_DAYS / days),
    };
  });

  // Histogram shaped like the lognormal above, so the mock panel reads the same
  // way the live one does.
  const lo = bandsFull[horizon][0] * SPOT;
  const hi = bandsFull[horizon][6] * SPOT;
  const bins = 28;
  const width = (hi - lo) / bins;
  const mid = (lo + hi) / 2;
  const spread = (hi - lo) / 4;
  const terminalHistogram: HistogramBin[] = Array.from({ length: bins }, (_, i) => {
    const centre = lo + (i + 0.5) * width;
    const density = Math.exp(-0.5 * ((centre - mid) / spread) ** 2);
    return {
      binLow: lo + i * width,
      binHigh: lo + (i + 1) * width,
      count: Math.round(density * 400 * (0.85 + rand() * 0.3)),
    };
  });

  const sigmaAnnual = DAILY_SIGMA * Math.sqrt(365) * 100;

  const stepSize = 1000;
  const probabilityLevels = [4, 3, 2, 1, -1, -2, -3, -4].map((k) => {
    const price = SPOT + k * stepSize;
    // P(above) under the same lognormal, so the numbers are self-consistent.
    const z = Math.log(price / SPOT) / (DAILY_SIGMA * Math.sqrt(horizon));
    const probAbove = 0.5 * (1 - Math.tanh(z * 0.7978845608));
    return { price, label: `${k > 0 ? '+' : ''}${k} step`, probAbove };
  });

  return {
    spot: SPOT,
    horizonDays: horizon,
    horizonLabel:
      HORIZON_SPEC[FORECAST_HORIZONS.find((k) => HORIZON_SPEC[k].days === horizon) ?? '1M']
        .label,
    bands: bandsFull.slice(0, horizon + 1),
    quantiles: DEFAULT_QUANTILES,
    history: Array.from({ length: 90 }, (_, i) => ({
      ts: anchor - (89 - i) * DAY_MS,
      close: SPOT * (1 + (rand() - 0.5) * 0.12),
    })),
    terminalHistogram,
    termStructure,
    probabilityLevels,
    sampleDays: SAMPLE_DAYS,
    historyStart: new Date(anchor - SAMPLE_DAYS * DAY_MS).toISOString().slice(0, 10),
    method: 'fhs',
    driftMode: 'zero',
    driftRemoved: 0.0008,
    garchConverged: true,
    sigmaNowAnnualPct: sigmaAnnual * 0.94,
    sigmaLongRunAnnualPct: sigmaAnnual,
    dvol: null,
  };
}
