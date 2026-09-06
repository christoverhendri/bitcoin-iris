import { defineFeature } from '@/lib/defineFeature';
import { fetchGeopoliticalEvents } from './live';
import { mockGeopoliticalEvents } from './mock';
import type { GeoEvent, GeoEventsArgs } from './types';

export const getGeopoliticalEvents = defineFeature<GeoEventsArgs, GeoEvent[]>({
  key: 'geopolitical_events',
  source: 'rss',
  live: fetchGeopoliticalEvents,
  mock: mockGeopoliticalEvents,
});

export type { GeoEvent, GeoEventsArgs, EventCategory } from './types';
export {
  CATEGORY_COLOR,
  impactRadius,
  toEventRow,
  impactTier,
  sentimentWord,
  IMPACT_TIER_COLOR,
} from './present';
export type { ImpactTier, SentimentWord } from './present';
export { EVENT_CATEGORIES } from '@/lib/geo/classify';
