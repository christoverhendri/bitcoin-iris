import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchWeeklyForward } from './live';
import { mockWeeklyForward } from './mock';
import type { WeeklyForward, WeeklyForwardArgs } from './types';

export const getWeeklyForward = defineFeature<WeeklyForwardArgs, WeeklyForward>({
  key: 'weekly_forward',
  source: 'internal_forecast',
  live: fetchWeeklyForward,
  mock: mockWeeklyForward,
  maxAgeSec: MAX_AGE_SEC.weeklyForecast,
});

export type { WeeklyForward, WeeklyForwardArgs };
