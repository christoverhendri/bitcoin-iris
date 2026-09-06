import { seeded } from '@/lib/rng';
import type { SentimentData, SentimentArgs } from './types';

export function mockSentiment({ days = 7 }: SentimentArgs): SentimentData {
  const r = seeded('sentiment');
  
  return {
    positivePct: 30 + r() * 20,
    negativePct: 20 + r() * 20,
    neutralPct: 50 - (r() * 40),
    score: (r() - 0.5) * 2,
  };
}
