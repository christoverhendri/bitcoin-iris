import { fmtCompact, fmtPct, fmtUsd } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';
import type { PositioningData } from './types';

export const CROWDING_NOTE =
  'Two cohorts of the same venue. The retail line counts accounts — every trader ' +
  'is one vote regardless of size. The top-trader line weights by position among ' +
  'the largest accounts by margin. When they disagree, the larger book has ' +
  'historically been the better guess. That is a market aphorism, not a law: it ' +
  'fails in strong trends, which is exactly when following it costs most.';

export const SINGLE_VENUE_NOTE =
  'Binance only. This is one venue’s book, not the market’s — its retail mix is ' +
  'not everyone’s, it geo-blocks some jurisdictions, and the “top trader” cohort ' +
  'is defined by Binance’s own margin ranking, which cannot be inspected.';

export const PREMIUM_NOTE =
  'Coinbase Premium: BTC-USD on Coinbase against BTCUSDT on Binance. Coinbase is ' +
  'where US institutions transact, so a persistent positive gap reads as the ' +
  'American bid paying up. Two caveats — Binance quotes in USDT, so part of any ' +
  'gap is really a stablecoin drift, and typical readings are a few basis points, ' +
  'well inside the spread. Read the trend, not the tick.';

export const TAKER_NOTE =
  'Taker volume is what crossed the spread — orders that paid for immediacy rather ' +
  'than resting on the book. Above 1.0 means buyers were lifting offers.';

/** A ratio's distance from balanced, toned by which side is crowded. */
export function ratioTone(ratio: number): Tone {
  if (ratio >= 1.3) return 'down'; // crowded long — squeeze risk
  if (ratio <= 0.85) return 'up'; // crowded short — squeeze risk the other way
  return 'txt';
}

export function biasTone(bias: PositioningData['bias']): Tone {
  if (bias === 'bullish') return 'up';
  if (bias === 'bearish') return 'down';
  return 'txt';
}

/** The premium is a spot-demand read: positive is a bid, negative an offer. */
export function premiumTone(pct: number): Tone {
  if (pct > 0.02) return 'up';
  if (pct < -0.02) return 'down';
  return 'txt';
}

export function divergenceTone(d: number): Tone {
  if (d >= 0.5) return 'up';
  if (d <= -0.5) return 'down';
  return 'txt';
}

export function toPositioningLabels(d: PositioningData) {
  const last = d.taker[d.taker.length - 1];
  return {
    retailRatio: d.available.retail ? d.retailRatio.toFixed(3) : '—',
    retailLongPct: d.available.retail
      ? fmtPct((d.retailRatio / (1 + d.retailRatio)) * 100, false, 1)
      : '—',
    topTraderRatio: d.available.topTrader ? d.topTraderRatio.toFixed(3) : '—',
    topTraderLongPct: d.available.topTrader
      ? fmtPct((d.topTraderRatio / (1 + d.topTraderRatio)) * 100, false, 1)
      : '—',
    divergence: d.available.retail && d.available.topTrader
      ? (d.divergence >= 0 ? '+' : '') + d.divergence.toFixed(3)
      : '—',
    takerRatio: d.available.taker ? d.takerBuySellRatio.toFixed(3) : '—',
    takerBuyVol: last ? fmtCompact(last.buyVol) : '—',
    takerSellVol: last ? fmtCompact(last.sellVol) : '—',
    premium: d.available.premium ? fmtPct(d.coinbasePremiumPct, true, 4) : '—',
    reference: d.referencePrice > 0 ? fmtUsd(d.referencePrice) : '—',
    maxSpread: fmtPct(d.maxSpreadPct, false, 4),
    bias: d.bias.toUpperCase(),
  };
}
