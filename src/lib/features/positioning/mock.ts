import { dateSeed, mulberry32, utcDay } from '@/lib/rng';
import type {
  PositioningArgs,
  PositioningData,
  RatioPoint,
  TakerPoint,
  VenuePrice,
} from './types';

const HOUR_MS = 3_600_000;

/** A gentle random walk that stays inside sane bounds for a long/short ratio. */
function walkRatio(
  rand: () => number,
  hours: number,
  anchor: number,
  start: number,
  step: number,
  lo: number,
  hi: number,
): RatioPoint[] {
  const out: RatioPoint[] = [];
  let v = start;
  for (let i = hours - 1; i >= 0; i -= 1) {
    v = Math.max(lo, Math.min(hi, v + (rand() - 0.5) * step));
    out.push({
      ts: anchor - i * HOUR_MS,
      ratio: v,
      // ratio = long/short, and long + short = 1, so long = r / (1 + r).
      longShare: v / (1 + v),
    });
  }
  return out;
}

export function mockPositioning({ hours = 48 }: PositioningArgs): PositioningData {
  const rand = mulberry32(dateSeed('positioning'));
  // Seeded off the UTC day, never `Date.now()`, so SSR and hydration agree.
  const anchor = Date.parse(`${utcDay()}T00:00:00.000Z`);

  const retail = walkRatio(rand, hours, anchor, 1.05, 0.06, 0.7, 1.6);
  // Top traders sit structurally more long than the crowd more often than not.
  const topTrader = walkRatio(rand, hours, anchor, 1.9, 0.1, 1.0, 2.8);

  const taker: TakerPoint[] = [];
  for (let i = hours - 1; i >= 0; i -= 1) {
    const buyVol = 1500 + rand() * 2500;
    const sellVol = 1500 + rand() * 2500;
    taker.push({
      ts: anchor - i * HOUR_MS,
      buyVol,
      sellVol,
      ratio: buyVol / sellVol,
      netVol: buyVol - sellVol,
    });
  }

  const retailRatio = retail[retail.length - 1].ratio;
  const topTraderRatio = topTrader[topTrader.length - 1].ratio;
  const divergence = topTraderRatio - retailRatio;

  const bias: PositioningData['bias'] =
    divergence >= 0.5 ? 'bullish' : divergence <= -0.5 ? 'bearish' : 'neutral';

  const reference = 78_000 + rand() * 4000;
  const premiumPct = (rand() - 0.5) * 0.08;
  const coinbase = reference * (1 + premiumPct / 100);
  const bybit = reference * (1 + (rand() - 0.5) * 0.0006);

  const venues: VenuePrice[] = [
    { venue: 'Binance', price: reference, spreadPct: 0 },
    { venue: 'Coinbase', price: coinbase, spreadPct: ((coinbase - reference) / reference) * 100 },
    {
      venue: 'Bybit (perp)',
      price: bybit,
      spreadPct: ((bybit - reference) / reference) * 100,
    },
  ];

  return {
    retail,
    topTrader,
    taker,
    retailRatio,
    topTraderRatio,
    takerBuySellRatio: taker[taker.length - 1].ratio,
    divergence,
    bias,
    biasReason:
      divergence >= 0.5
        ? 'Large accounts are markedly more long than the crowd.'
        : divergence <= -0.5
          ? 'Large accounts are markedly more short than the crowd.'
          : 'Both cohorts sit close to balanced; positioning is not saying much.',
    coinbasePremiumPct: premiumPct,
    referencePrice: reference,
    venues,
    maxSpreadPct: venues.reduce((m, v) => Math.max(m, Math.abs(v.spreadPct)), 0),
    available: { retail: true, topTrader: true, taker: true, premium: true },
  };
}
