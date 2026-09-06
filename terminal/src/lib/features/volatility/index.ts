import { defineFeature } from '@/lib/defineFeature';
import { fetchVolatility } from './live';
import { mockVolatility } from './mock';
import type { VolatilityData, VolatilityArgs } from './types';

export const getVolatility = defineFeature<VolatilityArgs, VolatilityData>({
  key: 'volatility',
  source: 'internal_quant',
  live: fetchVolatility,
  mock: mockVolatility,
});

export type { VolatilityData, VolatilityArgs };
export { toVolatilityLabels } from './present';
