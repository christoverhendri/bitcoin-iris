import { defineFeature } from '@/lib/defineFeature';
import { fetchSentiment } from './live';
import { mockSentiment } from './mock';
import type { SentimentData, SentimentArgs } from './types';

export const getSentiment = defineFeature<SentimentArgs, SentimentData>({
  key: 'sentiment',
  source: 'rss',
  live: fetchSentiment,
  mock: mockSentiment,
});

export type { SentimentData, SentimentArgs };
export { toSentimentLabels, getSentimentColor } from './present';
