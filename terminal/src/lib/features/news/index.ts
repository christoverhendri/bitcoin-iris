import { defineFeature } from '@/lib/defineFeature';
import { fetchNews } from './live';
import { getCryptoNewsSnapshot } from '@/lib/sources/rss';
import type { NewsArticle, NewsArgs } from './types';

const resolveNews = defineFeature<NewsArgs, NewsArticle[]>({
  key: 'news',
  source: 'rss',
  live: fetchNews,
  mock: () => [],
});

export type { NewsArticle, NewsArgs };
export {
  toNewsLabel,
  getNewsSentimentColor,
  newsSentimentWord,
  newsCategoryColor,
  newsImpactColor,
} from './present';

export async function getNews(args: NewsArgs) {
  const news = await resolveNews(args);
  const { feeds } = await getCryptoNewsSnapshot();
  return { ...news, feeds };
}
