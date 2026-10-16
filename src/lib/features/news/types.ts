import type { EventCategory } from '@/lib/geo/classify';

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
  /** ms epoch; the list is ordered newest first. */
  publishedAt: number;
}

export interface NewsArgs {
  limit?: number;
}

export type { EventCategory };
