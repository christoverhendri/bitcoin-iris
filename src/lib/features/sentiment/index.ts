import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchSentiment } from './live';
import { mockSentiment } from './mock';
import type { SentimentData, SentimentArgs } from './types';

export const getSentiment = defineFeature<SentimentArgs, SentimentData>({
  key: 'sentiment',
  source: 'rss',
  live: fetchSentiment,
  mock: mockSentiment,
  maxAgeSec: MAX_AGE_SEC.news,
});

export type { SentimentData, SentimentArgs };
export { toSentimentLabels } from './present';
