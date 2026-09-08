import {
  CATEGORY_COLOR,
  IMPACT_TIER_COLOR,
  type ImpactTier,
} from '@/lib/features/geopoliticalEvents/present';
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

export function newsImpactColor(tier: ImpactTier | null): string {
  return tier ? IMPACT_TIER_COLOR[tier] : 'var(--mut)';
}

export function newsAssessmentLabel(article: NewsArticle): string {
  if (article.semantic?.parse.needs_review) return 'REVIEW';
  if (article.semantic && article.sentiment === 'neutral') return 'NO DIRECTION';
  return newsSentimentWord(article.sentiment);
}

export function newsRankingLabel(article: NewsArticle): string {
  return article.semantic ? `WEIGHT ${article.semantic.weighting.post_weight.toFixed(3)}` : `${article.impactTier} IMPACT`;
}
