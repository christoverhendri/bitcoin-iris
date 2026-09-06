import { seeded } from '@/lib/rng';
import type { MacroMetric, MacroCountryArgs } from './types';

const COUNTRIES = ['US', 'CN', 'EU', 'JP', 'GB', 'ID'];

export function mockMacroCountry({ countries = COUNTRIES }: MacroCountryArgs): MacroMetric[] {
  const r = seeded('macro_country');
  
  return countries.map(country => {
    const cpi = 100 + (r() - 0.5) * 20;
    const rate = 2 + r() * 6;
    const growth = 1 + (r() - 0.5) * 4;
    const inflation = 2 + r() * 6;
    
    return {
      country,
      cpi,
      rate,
      growth,
      inflation,
      zScores: {
        cpi: (r() - 0.5) * 3,
        rate: (r() - 0.5) * 3,
        growth: (r() - 0.5) * 3,
        inflation: (r() - 0.5) * 3,
      },
    };
  });
}
