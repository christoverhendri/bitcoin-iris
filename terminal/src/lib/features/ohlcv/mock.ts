import { seeded, walk } from '@/lib/rng';
import type { OhlcvCandle, OhlcvArgs } from './types';

export function mockOhlcv({ symbol = 'BTC', interval = '1h', limit = 100 }: OhlcvArgs): OhlcvCandle[] {
  const r = seeded('ohlcv');
  const now = Date.now();
  
  // Generate price walk in 100-120K range
  const closes = walk(r, 110000, limit, 2, 0);
  
  const candles: OhlcvCandle[] = [];
  const intervalMs = interval === '1h' ? 3600000 : interval === '4h' ? 14400000 : 86400000;
  
  for (let i = 0; i < limit; i++) {
    const close = closes[i];
    const open = close * (1 + (r() - 0.5) * 0.01);
    const high = Math.max(open, close) * (1 + r() * 0.005);
    const low = Math.min(open, close) * (1 - r() * 0.005);
    const volume = r() * 1000;
    
    candles.push({
      symbol,
      interval,
      ts: now - (limit - i - 1) * intervalMs,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  
  return candles;
}
