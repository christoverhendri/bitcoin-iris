/**
 * Live confluence score — a transparent blend of five layers, each mapped to a
 * 0-100 scale where 50 is neutral. Computed from real keyless sources:
 * Coinbase/Kraken candles (technical), alternative.me Fear & Greed + RSS news
 * tone (sentiment / news), and Yahoo Finance for the macro layer. ONCHAIN is
 * still held at neutral 50 until an on-chain trend is wired here, and its weight
 * is cut accordingly — a layer that cannot move should not carry influence.
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { getFearGreed } from '@/lib/sources/alternativeme';
import { getCryptoNews } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { getMacroSeries } from '@/lib/sources/yahoo';
import { ema, rsi, macd, bollinger } from '@/lib/quant/series';
import { zScore } from '@/lib/quant/correlation';
import type { ConfluenceData, ConfluenceArgs } from './types';

/**
 * Arbitrary internal weights — how much each layer contributes to the overall
 * score. They sum to 1.0. Not fitted; a documented heuristic blend.
 *
 * MACRO went 0.10 -> 0.20 when it stopped being a constant. ONCHAIN went
 * 0.12 -> 0.06 for the opposite reason: it is still hardcoded 50, and a layer
 * that never moves should not be allowed to dilute the ones that do.
 */
export const WEIGHTS = {
  TECHNICAL: 0.34,
  SENTIMENT: 0.2,
  NEWS: 0.2,
  MACRO: 0.2,
  ONCHAIN: 0.06,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** Map a signal in [-1, 1] to a 0-100 score around a neutral 50. */
const to100 = (signal: number) => 50 + clamp(signal, -1, 1) * 50;

/** Linear interpolation across an anchor table, clamped at both ends. */
function interpolate(x: number, anchors: [number, number][]): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

export interface MacroInputs {
  /** Dollar index level as a z-score against its own trailing year. */
  dxyZ: number | null;
  /** VIX level, in points. Not a z-score — see below. */
  vixLevel: number | null;
  /** S&P 500 30-day change, percent. */
  spx30dPct: number | null;
}

/**
 * The macro layer, 0-100. Every mapping here is OPINION and is recorded in
 * `docs/DECISIONS.md`.
 *
 *  - DXY is negated: a strong dollar is a headwind for BTC. Two standard
 *    deviations of dollar strength pins the sub-signal at its floor.
 *  - VIX is mapped on its LEVEL, not a z-score. Its distribution is heavily
 *    right-skewed, so a z-score understates exactly the spikes that matter.
 *  - SPX is a risk-appetite read: a +10% month pins it at the ceiling.
 *
 * Sub-signals that are missing are skipped rather than defaulted to neutral, so
 * one dead symbol does not quietly drag the layer toward 50. With nothing
 * available at all it returns 50 — the same honest neutral as before.
 */
export function macroScore({ dxyZ, vixLevel, spx30dPct }: MacroInputs): number {
  const signals: number[] = [];

  if (dxyZ !== null) signals.push(-clamp(dxyZ / 2, -1, 1));

  if (vixLevel !== null) {
    signals.push(
      interpolate(vixLevel, [
        [15, 1],
        [20, 0.5],
        [25, 0],
        [35, -0.5],
        [45, -1],
      ]),
    );
  }

  if (spx30dPct !== null) signals.push(clamp(spx30dPct / 10, -1, 1));

  if (signals.length === 0) return 50;
  return to100(signals.reduce((s, v) => s + v, 0) / signals.length);
}

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

  // --- MACRO: dollar, vol complex and equities, from keyless Yahoo -------
  // Wrapped so a Yahoo outage degrades this layer to neutral rather than taking
  // the whole confluence page down. It could not 500 before and must not start.
  let MACRO = 50;
  try {
    const m = await getMacroSeries('1y');
    const spx30 =
      m.spx && m.spx.closes.length > 30
        ? (m.spx.closes[m.spx.closes.length - 1] /
            m.spx.closes[m.spx.closes.length - 31] -
            1) *
          100
        : null;
    MACRO = macroScore({
      dxyZ: m.dxy ? zScore(m.dxy.closes) : null,
      vixLevel: m.vix ? m.vix.last : null,
      spx30dPct: spx30,
    });
  } catch {
    MACRO = 50;
  }

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

  // Dated by the price candles it is computed from (the technical layer is a
  // third of the score); render time would hide a stale price feed.
  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
