import type { EventCategory } from '@/lib/geo/classify';
import type { ImpactTier } from '@/lib/features/geopoliticalEvents/present';

export interface NewsArticle {
  title: string;
  source: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  /** "time ago" label, kept for the compact row. */
  btcWindow: string;
  url?: string;
  /** First paragraph of the story body. '' when the feed omitted one. */
  description: string;
  /** Keyword classification, shared with the Global Events map. */
  category: EventCategory;
  /** 0..100 heuristic — category base + recency. */
  impact: number;
  impactTier: ImpactTier;
  /** ms epoch, for the detail view and secondary sort. */
  publishedAt: number;
}

export interface NewsArgs {
  limit?: number;
}

export type { EventCategory, ImpactTier };
