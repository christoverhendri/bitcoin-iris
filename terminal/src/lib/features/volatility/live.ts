/**
 * Live realised volatility — annualised stdev of daily log returns over 30d and
 * 90d windows, from real Coinbase daily closes. Kraken fallback.
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { realizedVolPct } from '@/lib/quant/series';
import type { VolatilityData, VolatilityArgs } from './types';

export async function fetchVolatility(_args: VolatilityArgs) {
  void _args;

  let candles;
  try {
    candles = await coinbaseCandles('1d', 120, 'BTC-USD');
    if (candles.length < 35) throw new Error('not enough coinbase candles');
  } catch {
    candles = await krakenCandles('1d', 'XBTUSD');
  }
  if (candles.length < 35) return null;

  const closes = candles.map((c) => c.close);

  const data: VolatilityData = {
    vol30d: realizedVolPct(closes, 30),
    vol90d: realizedVolPct(closes, Math.min(90, closes.length - 1)),
  };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
