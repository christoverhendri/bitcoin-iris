/** OHLCV providers are interchangeable only when they serve the same interval. */
import { getCandles as coinbaseCandles, COINBASE_GRANULARITY } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles, KRAKEN_INTERVAL_MIN } from '@/lib/sources/kraken';
import type { OhlcvCandle, OhlcvArgs } from './types';

export async function fetchOhlcv({ symbol = 'BTC-USD', interval = '1d', limit = 100 }: OhlcvArgs) {
  if (symbol !== 'BTC-USD') throw new Error('OHLCV supports BTC-USD only');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid candle limit');
  const supportsCoinbase = COINBASE_GRANULARITY[interval] !== undefined;
  const supportsKraken = KRAKEN_INTERVAL_MIN[interval] !== undefined;
  if (!supportsCoinbase && !supportsKraken) throw new Error(`Unsupported candle interval ${interval}`);
  const order: ('coinbase' | 'kraken')[] = supportsKraken && (!supportsCoinbase || limit > 300)
    ? ['kraken', ...(supportsCoinbase ? ['coinbase' as const] : [])]
    : ['coinbase', ...(supportsKraken ? ['kraken' as const] : [])];
  let lastError: unknown;
  for (const sourceKey of order) {
    try {
      const candles = sourceKey === 'coinbase'
        ? await coinbaseCandles(interval, Math.min(limit, 300), symbol)
        : await krakenCandles(interval, 'XBTUSD');
      if (!candles.length) throw new Error(`${sourceKey} returned no candles`);
      const trimmed = candles.slice(-limit);
      const data: OhlcvCandle[] = trimmed.map((c) => ({
        symbol, interval, ts: c.ts * 1000,
        open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }));
      return { data, sourceKey, asOf: new Date(data[data.length - 1].ts).toISOString(), synthetic: false };
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
