/**
 * Deterministic placeholder events. Seeded from the UTC day so SSR and hydration
 * agree and the set drifts once per day. Same `GeoEvent` shape as the live path.
 */
import { between, intBetween, seeded, utcDay } from '@/lib/rng';
import { classify } from '@/lib/geo/classify';
import { geocode } from '@/lib/geo/gazetteer';
import { scoreHeadline } from '@/lib/sources/lexicon';
import type { GeoEvent, GeoEventsArgs } from './types';

const SEED_HEADLINES: { title: string; source: string }[] = [
  { title: 'SEC signals updated framework for US crypto exchanges', source: 'CoinDesk' },
  { title: 'BlackRock spot ETF sees record weekly inflow', source: 'Decrypt' },
  { title: 'Major exchange in Singapore reports security breach', source: 'CoinTelegraph' },
  { title: 'Federal Reserve holds rates as CPI cools in Washington', source: 'Reuters' },
  { title: 'ECB officials debate digital euro rollout in Frankfurt', source: 'Reuters' },
  { title: 'El Salvador adds to Bitcoin treasury holding', source: 'NewsBTC' },
  { title: 'Court ruling in New York clears path for token settlement', source: 'CoinDesk' },
  { title: 'China policy shift pressures mining operations in Beijing', source: 'Al Jazeera' },
  { title: 'UK FCA opens consultation on crypto licensing in London', source: 'Decrypt' },
  { title: 'Japan approves stablecoin integration for Tokyo banks', source: 'CoinTelegraph' },
  { title: 'Sanctions package targets crypto flows tied to Russia', source: 'AP' },
  { title: 'Dubai regulator grants new exchange license in the UAE', source: 'CoinDesk' },
];

export function mockGeopoliticalEvents({ limit = 60 }: GeoEventsArgs): GeoEvent[] {
  const r = seeded('geo_events');
  const dayStart = Date.parse(`${utcDay()}T00:00:00.000Z`);

  const events: GeoEvent[] = [];
  for (let i = 0; i < SEED_HEADLINES.length; i++) {
    const { title, source } = SEED_HEADLINES[i];
    const hit = geocode(title);
    if (!hit) continue;

    const offsetH = between(r, 1, 10) * (i + 1);
    const publishedAt = dayStart - Math.round(offsetH * 3_600_000);
    const category = classify(title);
    const impact = intBetween(r, 35, 92);

    events.push({
      id: `mock-${i}`,
      headline: title,
      source,
      publishedAt,
      category,
      sentiment: scoreHeadline(title),
      lat: hit.lat,
      lon: hit.lon,
      iso2: hit.iso2,
      place: hit.name,
      impact,
    });
  }

  return events.sort((a, b) => b.impact - a.impact || b.publishedAt - a.publishedAt).slice(0, limit);
}
