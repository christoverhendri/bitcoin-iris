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
 * rarely name a country.
 *
 * Events are ordered by publish time, newest first. There is no impact score:
 * the one that used to rank them (category base + recency + multi-source bonus)
 * was built from hand-picked numbers with nothing behind them, and so were the
 * standing "FOMC / CPI" calendar markers that were stamped with today's date
 * whether or not anything happened. Both were removed on 2026-10-16.
 *
 * The RSS parser lives in `sources/rss.ts`. This file used to carry a second copy
 * of it.
 */
import { fetchFeeds, getCryptoNews, type RssItem } from '@/lib/sources/rss';
import { INSTITUTION_FEEDS, SOURCE_PIN, WORLD_FEEDS } from '@/lib/sources/worldFeeds';
import { analyzeHeadlines } from '@/lib/sentiment/client';
import { classify } from '@/lib/geo/classify';
import { geocode } from '@/lib/geo/gazetteer';
import { hashString, utcDay } from '@/lib/rng';
import type { GeoEvent, GeoEventsArgs } from './types';

type RawItem = Pick<RssItem, 'title' | 'link' | 'publishedAt' | 'source'>;

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

  const byHeadline = new Map<string, GeoEvent>();

  for (const it of raw) {
    if (!it.title) continue;

    // The headline's own place wins. A source pin is only the fallback, so an
    // SEC release about Japan still lands on Japan rather than on Washington.
    const hit = geocode(it.title) ?? SOURCE_PIN[it.source] ?? null;
    if (!hit) continue;

    const category = classify(it.title);
    // Placeholder until the model labels the final list below.
    const sentiment = 'neutral' as const;

    const key = normHeadline(it.title);
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
    };

    // The same story from several outlets is one event; the first copy seen wins.
    if (!byHeadline.has(key)) byHeadline.set(key, event);
  }

  const picked = [...byHeadline.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit);

  if (picked.length === 0) return null;

  // Every headline on the map is labelled by the same sentiment model as the
  // news panels (one batched worker call; a down worker falls back per headline
  // to the keyword lexicon, labelled "Heuristic · model unavailable").
  const assessments = await analyzeHeadlines(picked.map((e) => e.headline));
  const data: GeoEvent[] = picked.map((e, i) => ({
    ...e,
    sentiment: assessments[i].label,
    sentimentAssessment: assessments[i],
  }));

  const newest = Math.max(...data.map((e) => e.publishedAt));
  return {
    data,
    asOf: new Date(newest).toISOString(),
    synthetic: false,
  };
}
