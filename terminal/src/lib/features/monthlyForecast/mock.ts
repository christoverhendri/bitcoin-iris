import { seeded, walk } from '@/lib/rng';
import type { MonthlyForecastPath, MonthlyForecastArgs } from './types';

export function mockMonthlyForecast({ symbol = 'BTC', simulations = 1000 }: MonthlyForecastArgs): MonthlyForecastPath {
  const r = seeded(`monthly_forecast_${symbol}`);
  
  const current = 110000;
  const paths = [];
  
  for (let sim = 0; sim < Math.min(simulations, 100); sim++) {
    const path = walk(r, current, 30, 3, 0);
    paths.push(path[path.length - 1]);
  }
  
  paths.sort((a, b) => a - b);
  const p10 = paths[Math.floor(paths.length * 0.1)];
  const p50 = paths[Math.floor(paths.length * 0.5)];
  const p90 = paths[Math.floor(paths.length * 0.9)];
  
  const pathPct = walk(r, 0, 30, 3, 0).map(v => ((v - current) / current) * 100);
  
  return {
    p10,
    p50,
    p90,
    pathPct,
  };
}
