import { defineFeature } from '@/lib/defineFeature';
import { candleMaxAgeSec } from '@/lib/maxAge';
import { fetchOhlcv } from './live';
import { mockOhlcv } from './mock';
import type { OhlcvCandle, OhlcvArgs } from './types';

export const getOhlcv = defineFeature<OhlcvArgs, OhlcvCandle[]>({
  key: 'ohlcv',
  source: 'coinbase',
  live: fetchOhlcv,
  mock: mockOhlcv,
  maxAgeSec: (a) => candleMaxAgeSec(a.interval ?? '1d'),
});

export type { OhlcvCandle, OhlcvArgs };
export { toOhlcvLabel } from './present';
