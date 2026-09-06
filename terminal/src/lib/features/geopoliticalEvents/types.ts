import type { EventCategory } from '@/lib/geo/classify';

export type { EventCategory };

export interface GeoEvent {
  id: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: number; // ms epoch
  category: EventCategory;
  sentiment: 'positive' | 'negative' | 'neutral';
  lat: number;
  lon: number;
  iso2: string;
  place: string;
  impact: number; // 0..100
}

export interface GeoEventsArgs {
  limit?: number;
}
