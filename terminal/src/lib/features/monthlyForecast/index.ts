import { defineFeature } from '@/lib/defineFeature';
import { fetchMonthlyForecast } from './live';
import { mockMonthlyForecast } from './mock';
import type { MonthlyForecastPath, MonthlyForecastArgs } from './types';

export const getMonthlyForecast = defineFeature<MonthlyForecastArgs, MonthlyForecastPath>({
  key: 'monthly_forecast',
  source: 'internal_forecast',
  live: fetchMonthlyForecast,
  mock: mockMonthlyForecast,
});

export type { MonthlyForecastPath, MonthlyForecastArgs };
export { toMonthlyForecastLabels, getMonthlyPathColor } from './present';
