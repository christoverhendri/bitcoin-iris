import { defineFeature } from '@/lib/defineFeature';
import { fetchOhlcv } from './live';
import { mockOhlcv } from './mock';
import type { OhlcvCandle, OhlcvArgs } from './types';

export const getOhlcv = defineFeature<OhlcvArgs, OhlcvCandle[]>({
  key: 'ohlcv',
  source: 'coinbase',
  live: fetchOhlcv,
  mock: mockOhlcv,
});

export type { OhlcvCandle, OhlcvArgs };
export { toOhlcvLabel } from './present';
