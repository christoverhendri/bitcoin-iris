/**
 * Live crypto news — merged public RSS feeds. Sentiment is a keyword heuristic
 * (see `sources/lexicon.ts`); category reuses the Global Events keyword
 * classifier. None of it is a model; the panel labels it as heuristic.
 *
 * Ordered newest first. There is no impact ranking: the score that used to sort
 * this list (a hand-picked base per category plus a recency bonus) had nothing
 * behind its numbers and was removed on 2026-10-16.
 */
import { getCryptoNews } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { classify } from '@/lib/geo/classify';
import type { NewsArticle, NewsArgs } from './types';

function ago(ms: number): string {
  if (!ms) return 'recent';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.round(s / 3600);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.round(h / 24)} days`;
}

export async function fetchNews({ limit = 5 }: NewsArgs) {
  const items = await getCryptoNews(15);
  if (!items.length) return null;

  const newest = items[0]?.publishedAt || Date.now();

  const articles: NewsArticle[] = items.map((it) => ({
    title: it.title,
    source: it.source,
    sentiment: scoreHeadline(it.title),
    btcWindow: ago(it.publishedAt),
    url: it.link || undefined,
    description: it.description,
    category: classify(it.title),
    publishedAt: it.publishedAt || newest,
  }));

  articles.sort((a, b) => b.publishedAt - a.publishedAt);

  return {
    data: articles.slice(0, limit),
    asOf: new Date(newest).toISOString(),
    synthetic: false,
  };
}
