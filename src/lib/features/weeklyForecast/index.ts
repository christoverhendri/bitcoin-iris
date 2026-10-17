import { defineFeature } from '@/lib/defineFeature';
import { fetchWeeklyForecast } from './live';
import { mockWeeklyForecast } from './mock';
import type { WeeklyForecastData, WeeklyForecastArgs } from './types';

export const getWeeklyForecast = defineFeature<WeeklyForecastArgs, WeeklyForecastData>({
  key: 'weekly_forecast',
  source: 'internal_forecast',
  live: fetchWeeklyForecast,
  mock: mockWeeklyForecast,
});

export type { WeeklyForecastData, WeeklyForecastArgs };
export {
  toWeeklyForecastLabels,
  getWeeklyForecastColor,
  forecastTargetDate,
  FORECAST_HORIZON_DAYS,
  VOL_BAND_HIT_RATE,
} from './present';
