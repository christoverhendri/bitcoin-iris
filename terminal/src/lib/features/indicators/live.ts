/**
 * Live technical indicators — computed from real Coinbase daily candles with the
 * pure formulas in `lib/quant/series.ts`. Kraken is the fallback price source.
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { ema, rsi, macd, bollinger } from '@/lib/quant/series';
import type { IndicatorData, IndicatorArgs } from './types';

// Granularities Coinbase serves; 4h / 1w are Kraken-only.
const COINBASE_GRANS = new Set(['1m', '5m', '15m', '1h', '6h', '1d']);

export async function fetchIndicators({ interval = '1d', limit = 300 }: IndicatorArgs) {
  // The indicators need history for the moving averages regardless of the
  // display timeframe, so never fetch fewer than 180 candles of the chosen
  // interval.
  const want = Math.min(300, Math.max(180, limit));

  let candles;
  try {
    if (COINBASE_GRANS.has(interval)) {
      candles = await coinbaseCandles(interval, want, 'BTC-USD');
      if (candles.length < 30) throw new Error('not enough coinbase candles');
    } else {
      candles = await krakenCandles(interval, 'XBTUSD');
    }
  } catch {
    candles = await krakenCandles(interval, 'XBTUSD');
  }
  if (candles.length < 30) return null;

  const closes = candles.map((c) => c.close);
  const last = (s: number[]) => s[s.length - 1];
  const { macd: macdLine, signal } = macd(closes);
  const bb = bollinger(closes, 20, 2);

  const data: IndicatorData = {
    rsi: rsi(closes, 14),
    macd: macdLine,
    macdSignal: signal,
    ema5: last(ema(closes, 5)),
    ema8: last(ema(closes, 8)),
    ema13: last(ema(closes, 13)),
    ema21: last(ema(closes, 21)),
    bollingerUpper: bb.upper,
    bollingerMiddle: bb.middle,
    bollingerLower: bb.lower,
  };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
