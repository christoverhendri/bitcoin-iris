import { defineFeature } from '@/lib/defineFeature';
import { fetchFearGreed } from './live';
import { mockFearGreed } from './mock';
import type { FearGreedData, FearGreedArgs } from './types';

export const getFearGreed = defineFeature<FearGreedArgs, FearGreedData>({
  key: 'fear_greed',
  source: 'alternative_me',
  live: fetchFearGreed,
  mock: mockFearGreed,
});

export type { FearGreedData, FearGreedArgs };
export { toFearGreedLabel } from './present';
