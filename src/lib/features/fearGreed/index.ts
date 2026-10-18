import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchFearGreed } from './live';
import { mockFearGreed } from './mock';
import type { FearGreedData, FearGreedArgs } from './types';

export const getFearGreed = defineFeature<FearGreedArgs, FearGreedData>({
  key: 'fear_greed',
  source: 'alternative_me',
  live: fetchFearGreed,
  mock: mockFearGreed,
  maxAgeSec: MAX_AGE_SEC.fearGreed,
});

export type { FearGreedData, FearGreedArgs };
export { toFearGreedLabel } from './present';
