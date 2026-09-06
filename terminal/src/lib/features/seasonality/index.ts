import { defineFeature } from '@/lib/defineFeature';
import { fetchSeasonality } from './live';
import { mockSeasonality } from './mock';
import type { SeasonalityCell, SeasonalityArgs } from './types';

export const getSeasonality = defineFeature<SeasonalityArgs, SeasonalityCell[]>({
  key: 'seasonality',
  source: 'internal_quant',
  live: fetchSeasonality,
  mock: mockSeasonality,
});

export type { SeasonalityCell, SeasonalityArgs };
export { toSeasonalityLabel, getSeasonalityColor } from './present';
