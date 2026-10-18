import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchGeopoliticalEvents } from './live';
import { mockGeopoliticalEvents } from './mock';
import type { GeoEvent, GeoEventsArgs } from './types';

export const getGeopoliticalEvents = defineFeature<GeoEventsArgs, GeoEvent[]>({
  key: 'geopolitical_events',
  source: 'rss',
  live: fetchGeopoliticalEvents,
  mock: mockGeopoliticalEvents,
  maxAgeSec: MAX_AGE_SEC.news,
});

export type { GeoEvent, GeoEventsArgs, EventCategory } from './types';
export { CATEGORY_COLOR, MARKER_RADIUS, toEventRow, sentimentWord } from './present';
export type { SentimentWord } from './present';
export { EVENT_CATEGORIES } from '@/lib/geo/classify';
