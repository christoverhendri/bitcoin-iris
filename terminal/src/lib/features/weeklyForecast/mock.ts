import { seeded, pick } from '@/lib/rng';
import type { WeeklyForecastData, WeeklyForecastArgs } from './types';

export function mockWeeklyForecast({ symbol = 'BTC' }: WeeklyForecastArgs): WeeklyForecastData {
  const r = seeded(`weekly_forecast_${symbol}`);
  
  const current = 110000;
  const directions = ['BULLISH', 'BEARISH', 'NEUTRAL'] as const;
  const label = pick(r, directions);
  
  return {
    label,
    confidence: 50 + r() * 30,
    range: {
      min: current * (1 - 0.1 - r() * 0.05),
      max: current * (1 + 0.1 + r() * 0.05),
    },
  };
}
