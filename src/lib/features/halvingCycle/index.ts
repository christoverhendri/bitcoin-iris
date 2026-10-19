import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchHalvingCycle } from './live';
import { mockHalvingCycle } from './mock';
import type { HalvingCycleArgs, HalvingCycleData } from './types';

export const getHalvingCycle = defineFeature<HalvingCycleArgs, HalvingCycleData>({
  key: 'halvingCycle',
  source: 'coinmetrics',
  live: fetchHalvingCycle,
  mock: mockHalvingCycle,
  maxAgeSec: MAX_AGE_SEC.dailyClose,
});

export type { HalvingCycleArgs, HalvingCycleData };
