import { defineFeature } from '@/lib/defineFeature';
import { fetchSocialSentiment } from './live';
import { mockSocialSentiment } from './mock';
import type { SocialSentimentArgs, SocialSentimentData } from './types';

export const getSocialSentiment = defineFeature<SocialSentimentArgs, SocialSentimentData>({
  key: 'social_sentiment',
  source: 'santiment',
  live: fetchSocialSentiment,
  mock: mockSocialSentiment,
});

export type { SocialSentimentArgs, SocialSentimentData, SocialSentimentDay } from './types';
export {
  BUCKETS,
  BUCKET_COLOR,
  BUCKET_LABEL,
  donutArcs,
  fmtShare,
  netTilt,
  type SentimentBucket,
} from './present';
