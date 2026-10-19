import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchSeasonality } from './live';
import { mockSeasonality } from './mock';
import type { SeasonalityCell, SeasonalityArgs } from './types';

export const getSeasonality = defineFeature<SeasonalityArgs, SeasonalityCell[]>({
  key: 'seasonality',
  source: 'coinmetrics',
  live: fetchSeasonality,
  mock: mockSeasonality,
  maxAgeSec: MAX_AGE_SEC.dailyClose,
});

export type { SeasonalityCell, SeasonalityArgs };
export { toSeasonalityLabel, getSeasonalityColor } from './present';
export { monthlySummary } from './stats';
