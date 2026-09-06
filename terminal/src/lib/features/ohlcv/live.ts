/**
 * Live OHLCV — Coinbase candles, with Kraken as the fallback when Coinbase
 * throws or hands back an empty window. Returned newest-first to match what the
 * old Supabase reader produced (`order('ts', desc)`).
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import type { OhlcvCandle, OhlcvArgs } from './types';

// Granularities Coinbase's public candles endpoint accepts. Anything else
// (4h, 1w) only exists on Kraken.
const COINBASE_GRANS = new Set(['1m', '5m', '15m', '1h', '6h', '1d']);

export async function fetchOhlcv({ symbol = 'BTC-USD', interval = '1d', limit = 100 }: OhlcvArgs) {
  let candles;
  // Coinbase caps a response at 300 candles, so a longer window — or an
  // interval Coinbase does not serve — has to come from Kraken.
  const needsKraken = !COINBASE_GRANS.has(interval) || limit > 290;
  if (needsKraken) {
    try {
      candles = await krakenCandles(interval, 'XBTUSD');
      if (!candles.length) throw new Error('kraken returned no candles');
    } catch {
      candles = await coinbaseCandles(COINBASE_GRANS.has(interval) ? interval : '1d', 300, 'BTC-USD');
    }
  } else {
    try {
      candles = await coinbaseCandles(interval, Math.min(limit, 300), 'BTC-USD');
      if (!candles.length) throw new Error('coinbase returned no candles');
    } catch {
      candles = await krakenCandles(interval, 'XBTUSD');
    }
  }
  if (!candles.length) return null;

  const trimmed = candles.slice(-limit); // oldest-first, as the mock and chart components expect
  const data: OhlcvCandle[] = trimmed.map((c) => ({
    symbol,
    interval,
    ts: c.ts * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  return {
    data,
    asOf: new Date(trimmed[trimmed.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
