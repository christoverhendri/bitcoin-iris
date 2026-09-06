/**
 * Live support/resistance — floor-trader pivot points from the last completed
 * candle of the active timeframe's interval, with `vwap` over the trailing
 * window. Real Coinbase data, Kraken fallback (and Kraken-only for 4h/1w).
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { pivotPoints, vwap } from '@/lib/quant/series';
import type { SupportResistanceLevels, LevelsArgs } from './types';

const COINBASE_GRANS = new Set(['1m', '5m', '15m', '1h', '6h', '1d']);

export async function fetchLevels({ interval = '1d', limit = 300 }: LevelsArgs) {
  const want = Math.min(300, Math.max(30, limit));

  let candles;
  try {
    if (COINBASE_GRANS.has(interval)) {
      candles = await coinbaseCandles(interval, want, 'BTC-USD');
      if (candles.length < 5) throw new Error('not enough coinbase candles');
    } else {
      candles = await krakenCandles(interval, 'XBTUSD');
    }
  } catch {
    candles = await krakenCandles(interval, 'XBTUSD');
  }
  if (candles.length < 5) return null;

  // Last *completed* bar for pivots (the final element may be partial).
  const ref = candles[candles.length - 2] ?? candles[candles.length - 1];
  const pp = pivotPoints(ref.high, ref.low, ref.close);

  const vwapWindow = Math.min(candles.length, Math.max(20, Math.round(want / 3)));

  const data: SupportResistanceLevels = {
    r2: pp.r2,
    r1: pp.r1,
    vwap: vwap(candles.slice(-vwapWindow)),
    s1: pp.s1,
    s2: pp.s2,
  };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
