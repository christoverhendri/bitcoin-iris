/**
 * Live crowd positioning.
 *
 * Six independent reads, all settled separately. Binance geo-blocks some
 * regions and the venue APIs fail on their own schedules, so one dead endpoint
 * costs its own panel — the `available` flags say which — rather than the page.
 * `null` is returned only when nothing at all answered.
 *
 * The bias buckets at the bottom are OPINION and are documented as such in
 * `docs/DECISIONS.md`. "Crowded retail longs are contrarian bearish" is a market
 * aphorism, not a law; it fails in trends, which is precisely when it costs most.
 */
import {
  getRetailRatio,
  getTopTraderRatio,
  getTakerFlow,
  getCoinbasePremium,
} from '@/lib/sources/positioning';
import { getSpot as getCoinbaseSpot } from '@/lib/sources/coinbase';
import { getBybitTicker } from '@/lib/sources/derivatives';
import type { PositioningArgs, PositioningData, TakerPoint, VenuePrice } from './types';

/**
 * Bias thresholds. Hand-chosen, not fitted to anything — they mark where a
 * divergence stops being noise, and they are the first thing to argue with.
 */
const DIVERGENCE_STRONG = 0.5;
const RETAIL_CROWDED_LONG = 1.2;
const RETAIL_CROWDED_SHORT = 0.85;

export async function fetchPositioning({ hours = 48 }: PositioningArgs) {
  const [retailR, topR, takerR, premiumR, bybitR] = await Promise.allSettled([
    getRetailRatio('1h', hours),
    getTopTraderRatio('1h', hours),
    getTakerFlow('1h', hours),
    getCoinbasePremium(),
    getBybitTicker(),
  ]);

  const retail = retailR.status === 'fulfilled' ? retailR.value : [];
  const topTrader = topR.status === 'fulfilled' ? topR.value : [];
  const takerRaw = takerR.status === 'fulfilled' ? takerR.value : [];
  const premium = premiumR.status === 'fulfilled' ? premiumR.value : null;

  // Nothing answered — the honest "no data" that routes to the badged mock.
  if (retail.length === 0 && topTrader.length === 0 && takerRaw.length === 0 && !premium) {
    return null;
  }

  const taker: TakerPoint[] = takerRaw.map((t) => ({
    ts: t.ts,
    buyVol: t.buyVol,
    sellVol: t.sellVol,
    ratio: t.ratio,
    netVol: t.buyVol - t.sellVol,
  }));

  const retailRatio = retail.length > 0 ? retail[retail.length - 1].ratio : 0;
  const topTraderRatio = topTrader.length > 0 ? topTrader[topTrader.length - 1].ratio : 0;
  const takerBuySellRatio = taker.length > 0 ? taker[taker.length - 1].ratio : 0;

  const haveBoth = retail.length > 0 && topTrader.length > 0;
  const divergence = haveBoth ? topTraderRatio - retailRatio : 0;

  let bias: PositioningData['bias'] = 'neutral';
  let biasReason = 'Not enough positioning data to take a view.';

  if (haveBoth) {
    if (divergence >= DIVERGENCE_STRONG && retailRatio <= RETAIL_CROWDED_SHORT) {
      bias = 'bullish';
      biasReason =
        'Large accounts are markedly more long than the crowd, and the crowd is net short.';
    } else if (divergence >= DIVERGENCE_STRONG) {
      bias = 'bullish';
      biasReason = 'Large accounts are markedly more long than the crowd.';
    } else if (divergence <= -DIVERGENCE_STRONG) {
      bias = 'bearish';
      biasReason = 'Large accounts are markedly more short than the crowd.';
    } else if (retailRatio >= RETAIL_CROWDED_LONG) {
      bias = 'bearish';
      biasReason =
        'Retail is crowded long without the large book agreeing — the classic squeeze setup.';
    } else if (retailRatio <= RETAIL_CROWDED_SHORT) {
      bias = 'bullish';
      biasReason = 'Retail is crowded short without the large book agreeing.';
    } else {
      bias = 'neutral';
      biasReason = 'Both cohorts sit close to balanced; positioning is not saying much.';
    }
  }

  // Cross-venue spread. Binance is the reference leg because it is also the
  // denominator of the Coinbase premium, so both numbers agree on a baseline.
  const reference = premium?.binanceUsd ?? 0;
  const venues: VenuePrice[] = [];
  const pushVenue = (venue: string, price: number) => {
    if (!(price > 0)) return;
    venues.push({
      venue,
      price,
      spreadPct: reference > 0 ? ((price - reference) / reference) * 100 : 0,
    });
  };

  if (premium) {
    pushVenue('Binance', premium.binanceUsd);
    pushVenue('Coinbase', premium.coinbaseUsd);
  } else {
    // Premium failed but Coinbase alone may still answer; show what we have.
    const cb = await getCoinbaseSpot('BTC-USD').catch(() => null);
    if (cb) pushVenue('Coinbase', cb.price);
  }
  if (bybitR.status === 'fulfilled' && bybitR.value.markPrice > 0) {
    pushVenue('Bybit (perp)', bybitR.value.markPrice);
  }

  const maxSpreadPct = venues.reduce((m, v) => Math.max(m, Math.abs(v.spreadPct)), 0);

  const data: PositioningData = {
    retail,
    topTrader,
    taker,
    retailRatio,
    topTraderRatio,
    takerBuySellRatio,
    divergence,
    bias,
    biasReason,
    coinbasePremiumPct: premium?.premiumPct ?? 0,
    referencePrice: reference,
    venues,
    maxSpreadPct,
    available: {
      retail: retail.length > 0,
      topTrader: topTrader.length > 0,
      taker: taker.length > 0,
      premium: premium !== null,
    },
  };

  const newest = Math.max(
    retail[retail.length - 1]?.ts ?? 0,
    topTrader[topTrader.length - 1]?.ts ?? 0,
    taker[taker.length - 1]?.ts ?? 0,
  );

  return {
    data,
    asOf: new Date(newest > 0 ? newest : Date.now()).toISOString(),
    synthetic: false,
  };
}
