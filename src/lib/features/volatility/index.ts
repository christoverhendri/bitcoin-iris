import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchVolatility } from './live';
import { mockVolatility } from './mock';
import type { VolatilityData, VolatilityArgs } from './types';

export const getVolatility = defineFeature<VolatilityArgs, VolatilityData>({
  key: 'volatility',
  source: 'internal_quant',
  live: fetchVolatility,
  mock: mockVolatility,
  maxAgeSec: MAX_AGE_SEC.dailyCandles,
});

export type { VolatilityData, VolatilityArgs };
export { toVolatilityLabels } from './present';
