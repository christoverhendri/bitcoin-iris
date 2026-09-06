import { seeded, pick } from '@/lib/rng';
import type { SeasonalityCell, SeasonalityArgs } from './types';

export function mockSeasonality({ symbol = 'BTC', years = 7 }: SeasonalityArgs): SeasonalityCell[] {
  const r = seeded(`seasonality_${symbol}`);
  const now = new Date();
  const startYear = now.getFullYear() - years;
  
  const data: SeasonalityCell[] = [];
  
  for (let y = startYear; y <= now.getFullYear(); y++) {
    for (let m = 1; m <= 12; m++) {
      data.push({
        year: y,
        month: m,
        returnPct: (r() - 0.5) * 100,
      });
    }
  }
  
  return data;
}
