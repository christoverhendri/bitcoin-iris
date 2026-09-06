import { seeded } from '@/lib/rng';
import type { ConfluenceData, ConfluenceArgs } from './types';

export function mockConfluence({ symbol = 'BTC' }: ConfluenceArgs): ConfluenceData {
  const r = seeded(`confluence_${symbol}`);
  
  const macro = 60 + r() * 20;
  const onchain = 65 + r() * 20;
  const sentiment = 55 + r() * 25;
  const technical = 70 + r() * 15;
  const news = 50 + r() * 30;
  
  const overall = (macro + onchain + sentiment + technical + news) / 5;
  
  return {
    layers: {
      MACRO: macro,
      ONCHAIN: onchain,
      SENTIMENT: sentiment,
      TECHNICAL: technical,
      NEWS: news,
    },
    scores: {
      overall,
      bullish: 50 + r() * 30,
      bearish: 50 + r() * 30,
    },
  };
}
