import { expect, it } from 'vitest';
import { mockOhlcv } from './mock';

it.each([['15m', 900_000], ['6h', 21_600_000]] as const)('keeps failed-provider mock %s candles on their native time grid', (interval, duration) => {
  const candles = mockOhlcv({ interval, limit: 3 });
  expect(candles[1].ts - candles[0].ts).toBe(duration);
  expect(candles.every((bar) => bar.ts % duration === 0 && bar.interval === interval)).toBe(true);
});
