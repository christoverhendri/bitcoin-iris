import { defineFeature } from '@/lib/defineFeature';
import { fetchGeopoliticalEvents } from './live';
import type { GeoEvent, GeoEventsArgs } from './types';

const resolveGeopoliticalEvents = defineFeature<GeoEventsArgs, GeoEvent[]>({
  key: 'geopolitical_events',
  source: 'rss',
  live: fetchGeopoliticalEvents,
  mock: () => [],
});

/** Missing or synthetic news must never manufacture event markers. */
export async function getGeopoliticalEvents(args: GeoEventsArgs) {
  const env = await resolveGeopoliticalEvents(args);
  return env.isMock ? { ...env, data: [] } : env;
}

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
