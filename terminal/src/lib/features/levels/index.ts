import { defineFeature } from '@/lib/defineFeature';
import { fetchLevels } from './live';
import { mockLevels } from './mock';
import type { SupportResistanceLevels, LevelsArgs } from './types';

export const getLevels = defineFeature<LevelsArgs, SupportResistanceLevels>({
  key: 'levels',
  source: 'internal_quant',
  live: fetchLevels,
  mock: mockLevels,
});

export type { SupportResistanceLevels, LevelsArgs };
export { toLevelsLabels } from './present';
