/**
 * Live Global Events feed.
 *
 * Three streams merge here: crypto headlines from the shared RSS batch, general
 * world news, and — the highest-signal of the three — press releases straight
 * from the SEC, the Federal Reserve, the CFTC and the ECB.
 *
 * Every headline runs through the keyword classifier, the sentiment lexicon and
 * the gazetteer. Items that resolve to no place are dropped, except from sources
 * that publish from one fixed address, which fall back to `SOURCE_PIN` — without
 * that, institutional headlines would be discarded almost every time, since they
 * rarely name a country. The static macro calendar is merged in as always-present
 * low-impact markers so the map is never empty.
 *
 * The RSS parser lives in `sources/rss.ts`. This file used to carry a second copy
 * of it.
 */
import { fetchFeeds, getCryptoNews, type RssItem } from '@/lib/sources/rss';
import { INSTITUTION_FEEDS, SOURCE_PIN, WORLD_FEEDS } from '@/lib/sources/worldFeeds';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { classify } from '@/lib/geo/classify';
import { geocode } from '@/lib/geo/gazetteer';
import { MACRO_CALENDAR } from '@/lib/geo/macroCalendar';
import { hashString, utcDay } from '@/lib/rng';
import type { EventCategory } from '@/lib/geo/classify';
import type { GeoEvent, GeoEventsArgs } from './types';

type RawItem = Pick<RssItem, 'title' | 'link' | 'publishedAt' | 'source'>;

const CATEGORY_BASE: Record<EventCategory, number> = {
  SECURITY: 70,
  MONETARY: 70,
  REGULATION: 60,
  ETF_FUND: 60,
  GEOPOLITICS: 60,
  LEGAL: 50,
  ADOPTION: 50,
  MARKET: 40,
  // Unreachable via `classify()` — flow events carry their own impact — but the
  // map must stay exhaustive.
  WHALE_FLOW: 55,
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function normHeadline(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function startOfUtcDay(): number {
  return Date.parse(`${utcDay()}T00:00:00.000Z`);
}

export async function fetchGeopoliticalEvents({ limit = 60 }: GeoEventsArgs) {
  const raw: RawItem[] = [];

  try {
    const crypto = await getCryptoNews(20);
    for (const it of crypto) {
      raw.push({ title: it.title, link: it.link, publishedAt: it.publishedAt, source: it.source });
    }
  } catch {
    // Crypto feed merge already swallows per-feed failures; ignore a total miss.
  }

  // World news and institutional press, fetched together. `fetchFeeds` logs any
  // feed that answered with nothing, so a source going dark is discoverable
  // instead of silently shrinking the map.
  const [world, institutions] = await Promise.all([
    fetchFeeds(WORLD_FEEDS, 25, 900).catch(() => null),
    // Press releases are low-volume and slow-moving; cache them for an hour.
    fetchFeeds(INSTITUTION_FEEDS, 15, 3600).catch(() => null),
  ]);
  if (world) raw.push(...world.items);
  if (institutions) raw.push(...institutions.items);

  // Cluster count by normalised headline — used for the multi-source impact bonus.
  const clusterCount = new Map<string, number>();
  for (const it of raw) {
    const k = normHeadline(it.title);
    if (k) clusterCount.set(k, (clusterCount.get(k) ?? 0) + 1);
  }

  const nowRef = Math.max(startOfUtcDay(), ...raw.map((it) => it.publishedAt || 0));

  const byHeadline = new Map<string, GeoEvent>();

  for (const it of raw) {
    if (!it.title) continue;

    // The headline's own place wins. A source pin is only the fallback, so an
    // SEC release about Japan still lands on Japan rather than on Washington.
    const hit = geocode(it.title) ?? SOURCE_PIN[it.source] ?? null;
    if (!hit) continue;

    const category = classify(it.title);
    const sentiment = scoreHeadline(it.title);

    const age = it.publishedAt ? Math.max(0, nowRef - it.publishedAt) : WINDOW_MS;
    const recencyBonus = Math.max(0, Math.round(20 * (1 - Math.min(1, age / WINDOW_MS))));

    const key = normHeadline(it.title);
    const cluster = clusterCount.get(key) ?? 1;
    const clusterBonus = Math.min(15, Math.max(0, cluster - 1) * 5);

    const impact = Math.max(0, Math.min(100, CATEGORY_BASE[category] + recencyBonus + clusterBonus));

    const id = `ev-${hashString(`${key}|${it.source}`).toString(36)}`;
    const event: GeoEvent = {
      id,
      headline: it.title,
      source: it.source,
      url: it.link || undefined,
      publishedAt: it.publishedAt || startOfUtcDay(),
      category,
      sentiment,
      lat: hit.lat,
      lon: hit.lon,
      iso2: hit.iso2,
      place: hit.name,
      impact,
    };

    const existing = byHeadline.get(key);
    if (!existing || event.impact > existing.impact) byHeadline.set(key, event);
  }

  // Always-present macro anchors.
  const dayStart = startOfUtcDay();
  for (const anchor of MACRO_CALENDAR) {
    const key = normHeadline(anchor.headline);
    if (byHeadline.has(key)) continue;
    byHeadline.set(key, {
      id: `cal-${hashString(anchor.headline).toString(36)}`,
      headline: anchor.headline,
      source: 'MACRO CALENDAR',
      publishedAt: dayStart,
      category: anchor.category,
      sentiment: 'neutral',
      lat: anchor.lat,
      lon: anchor.lon,
      iso2: anchor.iso2,
      place: anchor.place,
      impact: 25,
    });
  }

  const data = [...byHeadline.values()]
    .sort((a, b) => b.impact - a.impact || b.publishedAt - a.publishedAt)
    .slice(0, limit);

  if (data.length === 0) return null;

  const newest = Math.max(...data.map((e) => e.publishedAt));
  return {
    data,
    asOf: new Date(newest).toISOString(),
    synthetic: false,
  };
}
