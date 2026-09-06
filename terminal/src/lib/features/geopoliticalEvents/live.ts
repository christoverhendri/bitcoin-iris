/**
 * Live Global Events feed.
 *
 * Crypto headlines come from the shared RSS merge (`sources/rss.ts`); a few
 * broader world-news feeds are added best-effort. Every headline is run through
 * the keyword classifier, the sentiment lexicon and the gazetteer — items that
 * do not resolve to a place are dropped. The static macro calendar is merged in
 * as always-present low-impact markers, so the map is never empty.
 */
import { fetchText } from '@/lib/sources/http';
import { getCryptoNews } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { classify } from '@/lib/geo/classify';
import { geocode } from '@/lib/geo/gazetteer';
import { MACRO_CALENDAR } from '@/lib/geo/macroCalendar';
import { hashString, utcDay } from '@/lib/rng';
import type { EventCategory } from '@/lib/geo/classify';
import type { GeoEvent, GeoEventsArgs } from './types';

interface RawItem {
  title: string;
  link: string;
  publishedAt: number;
  source: string;
}

const BROADER_FEEDS: { source: string; url: string }[] = [
  { source: 'Reuters', url: 'https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best' },
  { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'AP', url: 'https://feedx.net/rss/ap.xml' },
];

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

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function pickTag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

function parseRss(xml: string, source: string): RawItem[] {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: RawItem[] = [];
  for (const block of blocks) {
    const rawTitle = pickTag(block, 'title');
    if (!rawTitle) continue;
    const rawLink = pickTag(block, 'link');
    const rawDate = pickTag(block, 'pubDate') ?? pickTag(block, 'dc:date') ?? pickTag(block, 'published');
    const parsed = rawDate ? Date.parse(stripTags(rawDate)) : NaN;
    out.push({
      title: stripTags(rawTitle),
      link: rawLink ? stripTags(rawLink) : '',
      publishedAt: Number.isFinite(parsed) ? parsed : 0,
      source,
    });
  }
  return out;
}

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

  // Independent feeds start together; a slow crypto feed must not delay the
  // start of all broader-news requests by another timeout window.
  const [cryptoResult, broaderResult] = await Promise.allSettled([
    getCryptoNews(20),
    Promise.allSettled(
      BROADER_FEEDS.map(async (f) => parseRss(await fetchText(f.url, { revalidate: 900 }), f.source).slice(0, 25)),
    ),
  ]);
  if (cryptoResult.status === 'fulfilled') {
    const crypto = cryptoResult.value;
    for (const it of crypto) {
      raw.push({ title: it.title, link: it.link, publishedAt: it.publishedAt, source: it.source });
    }
  }

  const broader = broaderResult.status === 'fulfilled' ? broaderResult.value : [];
  for (const r of broader) {
    if (r.status === 'fulfilled') raw.push(...r.value);
  }

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
    const hit = geocode(it.title);
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
