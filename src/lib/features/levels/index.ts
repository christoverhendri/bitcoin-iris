import { defineFeature } from '@/lib/defineFeature';
import { candleMaxAgeSec } from '@/lib/maxAge';
import { fetchLevels } from './live';
import { mockLevels } from './mock';
import type { SupportResistanceLevels, LevelsArgs } from './types';

export const getLevels = defineFeature<LevelsArgs, SupportResistanceLevels>({
  key: 'levels',
  source: 'internal_quant',
  live: fetchLevels,
  mock: mockLevels,
  maxAgeSec: (a) => candleMaxAgeSec(a.interval ?? '1d'),
});

export type { SupportResistanceLevels, LevelsArgs };
export { toLevelsLabels } from './present';
