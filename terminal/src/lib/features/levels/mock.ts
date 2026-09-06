import { seeded } from '@/lib/rng';
import type { SupportResistanceLevels, LevelsArgs } from './types';

export function mockLevels({ symbol = 'BTC' }: LevelsArgs): SupportResistanceLevels {
  const r = seeded(`levels_${symbol}`);
  
  const current = 110000 + (r() - 0.5) * 4000;
  const deviation = current * 0.075;
  
  return {
    r2: current + 2 * deviation,
    r1: current + deviation,
    vwap: current,
    s1: current - deviation,
    s2: current - 2 * deviation,
  };
}
