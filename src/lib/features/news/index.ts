import { defineFeature } from '@/lib/defineFeature';
import { fetchNews } from './live';
import { mockNews } from './mock';
import type { NewsArticle, NewsArgs } from './types';

export const getNews = defineFeature<NewsArgs, NewsArticle[]>({
  key: 'news',
  source: 'rss',
  live: fetchNews,
  mock: mockNews,
});

export type { NewsArticle, NewsArgs };
export {
  toNewsLabel,
  getNewsSentimentColor,
  newsSentimentWord,
  newsCategoryColor,
} from './present';
