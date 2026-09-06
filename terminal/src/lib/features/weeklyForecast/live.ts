/**
 * Live weekly forecast — a transparent RULE, not a model. The panel's
 * "RULE-BASED PLACEHOLDER" badge stays accurate: this is a weighted sum of a few
 * normalized technical/sentiment signals over real Coinbase daily candles
 * (Kraken fallback), plus the alternative.me Fear & Greed reading.
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { getFearGreed } from '@/lib/sources/alternativeme';
import { ema, rsi, macd, realizedVolPct } from '@/lib/quant/series';
import type { WeeklyForecastData, WeeklyForecastArgs } from './types';

/**
 * Arbitrary internal weights for the rule. They sum to 1.0 and express how much
 * each normalized signal (each in roughly [-1, 1]) moves the composite score.
 * Not fitted to anything — a documented heuristic blend.
 */
const WEIGHTS = {
  rsi: 0.25, // RSI distance from 50, i.e. (rsi - 50) / 50
  macd: 0.3, // sign of the MACD histogram, scaled by its size vs price
  emaGap: 0.3, // sign of EMA21 - EMA50 gap, scaled by the gap as % of price
  fng: 0.15, // Fear & Greed distance from 50, i.e. (value - 50) / 50
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export async function fetchWeeklyForecast({ symbol = 'BTC' }: WeeklyForecastArgs) {
  void symbol;

  let candles;
  try {
    candles = await coinbaseCandles('1d', 300, 'BTC-USD');
    if (candles.length < 60) throw new Error('not enough coinbase candles');
  } catch {
    candles = await krakenCandles('1d', 'XBTUSD');
  }
  if (candles.length < 60) return null;

  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  const rsiVal = rsi(closes, 14);
  const { macd: macdLine, signal } = macd(closes);
  const hist = macdLine - signal;
  const ema21 = ema(closes, 21).at(-1) ?? lastClose;
  const ema50 = ema(closes, 50).at(-1) ?? lastClose;
  const emaGapPct = ((ema21 - ema50) / lastClose) * 100;
  const vol = realizedVolPct(closes, 30);

  const fng = await getFearGreed(1).catch(() => null);
  const fngVal = fng && fng.length ? fng[0].value : null;

  // Normalize each signal to roughly [-1, 1].
  const nRsi = clamp((rsiVal - 50) / 50, -1, 1);
  const nMacd = clamp((hist / lastClose) * 2000, -1, 1); // histogram as fraction of price, scaled
  const nEmaGap = clamp(emaGapPct / 5, -1, 1); // a 5% EMA gap saturates the signal
  const nFng = fngVal === null ? 0 : clamp((fngVal - 50) / 50, -1, 1);

  const wFng = fngVal === null ? 0 : WEIGHTS.fng;
  const denom = WEIGHTS.rsi + WEIGHTS.macd + WEIGHTS.emaGap + wFng;
  const score = clamp(
    (WEIGHTS.rsi * nRsi + WEIGHTS.macd * nMacd + WEIGHTS.emaGap * nEmaGap + wFng * nFng) / denom,
    -1,
    1,
  );

  const label: WeeklyForecastData['label'] =
    score > 0.15 ? 'BULLISH' : score < -0.15 ? 'BEARISH' : 'NEUTRAL';
  const confidence = Math.min(95, 50 + Math.abs(score) * 60);

  const z = 1.0;
  const sigma = lastClose * (vol / 100) * Math.sqrt(7 / 365);
  const driftFromScore = lastClose * score * 0.03;
  let min = lastClose - z * sigma + driftFromScore;
  let max = lastClose + z * sigma + driftFromScore;
  if (min > max) [min, max] = [max, min];

  const data: WeeklyForecastData = { label, confidence, range: { min, max } };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
