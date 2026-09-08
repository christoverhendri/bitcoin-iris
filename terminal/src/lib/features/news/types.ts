import type { EventCategory } from '@/lib/geo/classify';
import type { ImpactTier } from '@/lib/features/geopoliticalEvents/present';
import type { SemanticNews } from '@/lib/sources/semanticNews';

export interface NewsArticle {
  semantic?: SemanticNews;
  title: string;
  source: string;
  /** neutral is the compatibility value for semantic rows; these are displayed
   * as unassessed/review, since assertion polarity is not market sentiment. */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** "time ago" label, kept for the compact row. */
  btcWindow: string;
  url?: string;
  /** First paragraph of the story body. '' when the feed omitted one. */
  description: string;
  /** Semantic event topic when available; otherwise terminal keyword rules. */
  category: EventCategory;
  /** Legacy 0..100 headline heuristic. Semantic ranking weight is separate. */
  impact: number | null;
  impactTier: ImpactTier | null;
  /** ms epoch, for the detail view and secondary sort. */
  publishedAt: number;
}

export interface NewsArgs {
  limit?: number;
}

export type { EventCategory, ImpactTier };
