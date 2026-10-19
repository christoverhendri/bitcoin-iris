import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchMonthlyForecast } from './live';
import { mockMonthlyForecast } from './mock';
import type { MonthlyForecastArgs, MonthlyForecastData } from './types';

export const getMonthlyForecast = defineFeature<MonthlyForecastArgs, MonthlyForecastData>({
  key: 'monthly_forecast',
  source: 'internal_monthly',
  live: fetchMonthlyForecast,
  mock: mockMonthlyForecast,
  maxAgeSec: MAX_AGE_SEC.monthlyForecast,
});

export type {
  MonthlyForecastData,
  MonthlyForecastArgs,
  DailyBand,
  ClosePoint,
  MonthlyBacktest,
  BacktestHorizon,
  BacktestMethod,
} from './types';
