/**
 * Live multi-horizon price distribution.
 *
 * One simulation serves the whole page. It runs to the longest horizon (1Y);
 * shorter horizons are read off intermediate band rows and the path-level
 * cross-section is captured at whichever horizon is on screen. Six independent
 * runs would cost six times as much and let the 1M row disagree with the 1Y row,
 * since they would come from different draws.
 *
 * What this page is: a distribution of outcomes conditional on today's
 * volatility, assuming the next N days resemble the last decade's *shape*.
 * What it is not: a directional forecast. Drift is removed on purpose — see
 * `docs/DECISIONS.md` §12.
 */
import { getDailyHistory, getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { getDerivatives } from '@/lib/features/derivatives';
import { getLevels } from '@/lib/features/levels';
import { simulate, probAbove, terminalHistogram, DEFAULT_QUANTILES } from '@/lib/quant/fhs';
import { HORIZON_SPEC, FORECAST_HORIZONS } from '@/lib/nav';
import { dateSeed } from '@/lib/rng';
import type {
  HorizonBand,
  PriceDistributionArgs,
  PriceDistributionData,
  ProbabilityLevel,
} from './types';

/** The longest horizon offered, and therefore the length of the single run. */
const MAX_HORIZON = 365;

/** Days of actual price drawn to the left of the cone. */
const HISTORY_TAIL = 90;

const TRADING_DAYS = 365;

export async function fetchPriceDistribution({
  horizonDays = 30,
  nPaths = 4000,
}: PriceDistributionArgs) {
  // A decade of daily closes, assembled by paging Coinbase. Kraken's ~720 is the
  // fallback; it still works, it just makes the long horizons thinner-sampled.
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
  if (closes.length < 120) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const r = Math.log(closes[i] / closes[i - 1]);
    if (Number.isFinite(r)) logReturns.push(r);
  }
  if (logReturns.length < 100) return null;

  const spot = closes[closes.length - 1];
  const horizon = Math.max(1, Math.min(MAX_HORIZON, Math.floor(horizonDays)));

  // Seeded off the UTC day so the page is stable within a day and SSR agrees
  // with hydration — never `Date.now()`.
  const seed = dateSeed(`priceDistribution_${horizon}`);

  const surface = simulate({
    returns: logReturns,
    horizonDays: MAX_HORIZON,
    nPaths,
    seed,
    method: 'fhs',
    driftMode: 'zero',
    quantiles: DEFAULT_QUANTILES,
    captureStep: horizon,
  });

  // Term structure: every horizon read off the same run.
  const sampleDays = logReturns.length;
  const termStructure: HorizonBand[] = FORECAST_HORIZONS.map((key) => {
    const { days, label } = HORIZON_SPEC[key];
    const row = surface.bands[Math.min(days, MAX_HORIZON)];
    const px = (i: number) => row[i] * spot;
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
      expectedMovePct: spot > 0 ? ((p75 - p25) / 2 / spot) * 100 : 0,
      rangePct: spot > 0 ? ((px(6) - px(0)) / spot) * 100 : 0,
      nonOverlappingWindows: Math.floor(sampleDays / days),
    };
  });

  // Price levels worth quoting a probability for: round numbers around spot,
  // plus the pivot levels the Market page already publishes.
  const levelCandidates: { price: number; label: string }[] = [];
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(spot, 1)));
  const stepSize = magnitude / 10;
  for (let k = -4; k <= 4; k += 1) {
    if (k === 0) continue;
    const price = Math.round((spot + k * stepSize) / stepSize) * stepSize;
    if (price > 0) levelCandidates.push({ price, label: `${k > 0 ? '+' : ''}${k} step` });
  }

  try {
    const levels = await getLevels({ symbol: 'BTC-USD', interval: '1d', limit: 300 });
    levelCandidates.push(
      { price: levels.data.r2, label: 'R2 pivot' },
      { price: levels.data.r1, label: 'R1 pivot' },
      { price: levels.data.s1, label: 'S1 pivot' },
      { price: levels.data.s2, label: 'S2 pivot' },
    );
  } catch {
    // Pivots are a garnish; losing them costs four rows, not the panel.
  }

  const probabilityLevels: ProbabilityLevel[] = levelCandidates
    .filter((l) => Number.isFinite(l.price) && l.price > 0)
    .map((l) => ({ ...l, probAbove: probAbove(surface, l.price / spot) }))
    // Dedupe on rounded price, keeping the first (named) label.
    .filter(
      (l, i, arr) => arr.findIndex((o) => Math.round(o.price) === Math.round(l.price)) === i,
    )
    .sort((a, b) => b.price - a.price);

  // DVOL is the option market's own forward vol — the only external check on
  // this model's volatility available anywhere in the app. Optional by design.
  let dvol: number | null = null;
  try {
    const derivs = await getDerivatives({ symbol: 'BTC-USD' });
    dvol = derivs.isMock ? null : derivs.data.dvol || null;
  } catch {
    dvol = null;
  }

  const annualise = (dailySigma: number) => dailySigma * Math.sqrt(TRADING_DAYS) * 100;

  const data: PriceDistributionData = {
    spot,
    horizonDays: horizon,
    horizonLabel: HORIZON_SPEC[
      (FORECAST_HORIZONS.find((k) => HORIZON_SPEC[k].days === horizon) ?? '1M')
    ].label,
    bands: surface.bands.slice(0, horizon + 1),
    quantiles: surface.quantiles,
    history: candles.slice(-HISTORY_TAIL).map((c) => ({ ts: c.ts * 1000, close: c.close })),
    terminalHistogram: terminalHistogram(surface, spot, 28),
    termStructure,
    probabilityLevels,
    sampleDays,
    historyStart: new Date(candles[0].ts * 1000).toISOString().slice(0, 10),
    method: surface.method,
    driftMode: surface.driftMode,
    driftRemoved: surface.driftRemoved,
    garchConverged: surface.garchConverged,
    sigmaNowAnnualPct: annualise(surface.sigmaNow),
    sigmaLongRunAnnualPct: annualise(surface.sigmaLongRun),
    dvol,
  };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
