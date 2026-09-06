import { seeded } from '@/lib/rng';
import type { VolatilityData, VolatilityArgs } from './types';

export function mockVolatility({ symbol = 'BTC' }: VolatilityArgs): VolatilityData {
  const r = seeded(`volatility_${symbol}`);
  
  return {
    vol30d: 10 + r() * 15,
    vol90d: 10 + r() * 15,
  };
}
