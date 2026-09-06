import { seeded } from '@/lib/rng';
import type { FearGreedData, FearGreedArgs } from './types';

export function mockFearGreed({ limit = 1 }: FearGreedArgs): FearGreedData {
  const r = seeded('fear_greed');
  const value = Math.round(20 + r() * 60);
  const classifications: FearGreedData['classification'][] = [
    'Extreme Fear',
    'Fear',
    'Neutral',
    'Greed',
    'Extreme Greed',
  ];
  const idx = Math.min(Math.floor(value / 20), 4);
  return {
    value,
    classification: classifications[idx],
    changePct: (r() - 0.5) * 10,
  };
}
