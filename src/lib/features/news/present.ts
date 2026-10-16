import { CATEGORY_COLOR } from '@/lib/features/geopoliticalEvents/present';
import type { NewsArticle } from './types';

export function toNewsLabel(article: NewsArticle) {
  return {
    title: article.title,
    source: article.source,
    sentiment: article.sentiment,
    btcWindow: article.btcWindow,
  };
}

export function getNewsSentimentColor(sentiment: string): string {
  if (sentiment === 'positive') return 'var(--up)';
  if (sentiment === 'negative') return 'var(--down)';
  return 'var(--mut)';
}

export function newsSentimentWord(sentiment: NewsArticle['sentiment']): string {
  if (sentiment === 'positive') return 'BULLISH';
  if (sentiment === 'negative') return 'BEARISH';
  return 'NEUTRAL';
}

export function newsCategoryColor(article: NewsArticle): string {
  return CATEGORY_COLOR[article.category] ?? 'var(--mut)';
}

