/**
 * Live confluence score — a transparent blend of five layers, each mapped to a
 * 0-100 scale where 50 is neutral. Computed from real keyless sources:
 * Coinbase/Kraken candles (technical), alternative.me Fear & Greed + RSS news
 * tone (sentiment / news). MACRO and ONCHAIN are held at neutral 50 until their
 * feeds are wired here.
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { getFearGreed } from '@/lib/sources/alternativeme';
import { getCryptoNews } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { ema, rsi, macd, bollinger } from '@/lib/quant/series';
import type { ConfluenceData, ConfluenceArgs } from './types';

/**
 * Arbitrary internal weights — how much each layer contributes to the overall
 * score. They sum to 1.0. Not fitted; a documented heuristic blend.
 */
const WEIGHTS = {
  TECHNICAL: 0.34,
  SENTIMENT: 0.22,
  NEWS: 0.22,
  ONCHAIN: 0.12,
  MACRO: 0.1,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** Map a signal in [-1, 1] to a 0-100 score around a neutral 50. */
const to100 = (signal: number) => 50 + clamp(signal, -1, 1) * 50;

export async function fetchConfluence({ symbol = 'BTC' }: ConfluenceArgs) {
  void symbol;

  let candles;
  try {
    candles = await coinbaseCandles('1d', 300, 'BTC-USD');
    if (candles.length < 60) throw new Error('not enough coinbase candles');
  } catch {
    try {
      candles = await krakenCandles('1d', 'XBTUSD');
    } catch {
      return null;
    }
  }
  if (candles.length < 60) return null;

  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  // --- TECHNICAL: average of four 0-100 sub-signals -------------------------
  const rsiScore = clamp(rsi(closes, 14), 0, 100);
  const { macd: macdLine, signal } = macd(closes);
  const macdScore = to100(((macdLine - signal) / lastClose) * 2000);
  const ema21 = ema(closes, 21).at(-1) ?? lastClose;
  const ema50 = ema(closes, 50).at(-1) ?? lastClose;
  const emaScore = to100(((ema21 - ema50) / lastClose) / 0.05);
  const bbMid = bollinger(closes, 20, 2).middle;
  const bbScore = to100(((lastClose - bbMid) / bbMid) / 0.05);
  const TECHNICAL = clamp((rsiScore + macdScore + emaScore + bbScore) / 4, 0, 100);

  // --- NEWS: headline tone from RSS ---------------------------------------
  let NEWS = 50;
  try {
    const items = await getCryptoNews(20);
    if (items.length) {
      let pos = 0;
      let neg = 0;
      for (const it of items) {
        const s = scoreHeadline(it.title);
        if (s === 'positive') pos++;
        else if (s === 'negative') neg++;
      }
      NEWS = clamp(50 + ((pos - neg) / items.length) * 50, 0, 100);
    }
  } catch {
    NEWS = 50;
  }

  // --- SENTIMENT: Fear & Greed blended 50/50 with news tone --------------
  const fng = await getFearGreed(1).catch(() => null);
  const fngVal = fng && fng.length ? clamp(fng[0].value, 0, 100) : null;
  const SENTIMENT = fngVal === null ? NEWS : clamp(0.5 * fngVal + 0.5 * NEWS, 0, 100);

  // --- ONCHAIN: neutral until an on-chain trend is wired here -----------
  const ONCHAIN = 50;

  // --- MACRO: neutral — FRED not wired here; see macroCountry ----------
  const MACRO = 50;

  const overall = clamp(
    WEIGHTS.TECHNICAL * TECHNICAL +
      WEIGHTS.SENTIMENT * SENTIMENT +
      WEIGHTS.NEWS * NEWS +
      WEIGHTS.ONCHAIN * ONCHAIN +
      WEIGHTS.MACRO * MACRO,
    0,
    100,
  );

  const data: ConfluenceData = {
    layers: { MACRO, ONCHAIN, SENTIMENT, TECHNICAL, NEWS },
    scores: {
      overall,
      bullish: overall,
      bearish: 100 - overall,
    },
  };

  return {
    data,
    asOf: new Date().toISOString(),
    synthetic: false,
  };
}
