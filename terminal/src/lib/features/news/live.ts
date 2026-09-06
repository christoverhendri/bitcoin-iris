/**
 * Live crypto news — merged public RSS feeds. Sentiment is a keyword heuristic
 * (see `sources/lexicon.ts`); category and impact reuse the Global Events
 * classifier. None of it is a model; the panel labels it as heuristic.
 */
import { getCryptoNewsSnapshot } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { classify, type EventCategory } from '@/lib/geo/classify';
import { impactTier } from '@/lib/features/geopoliticalEvents/present';
import type { NewsArticle, NewsArgs } from './types';

/** Category weight, mirrors `geopoliticalEvents/live.ts`. */
const CATEGORY_BASE: Record<EventCategory, number> = {
  SECURITY: 70,
  MONETARY: 70,
  REGULATION: 60,
  ETF_FUND: 60,
  GEOPOLITICS: 60,
  LEGAL: 50,
  ADOPTION: 50,
  MARKET: 40,
  WHALE_FLOW: 55,
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function ago(ms: number): string {
  if (!ms) return 'date unavailable';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.round(s / 3600);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.round(h / 24)} days`;
}

export async function fetchNews({ limit = 5 }: NewsArgs) {
  const { items, feeds } = await getCryptoNewsSnapshot(2000, true);
  if (!items.length) return null;

  const newest = items[0]?.publishedAt || Date.now();

  const scored: NewsArticle[] = items.map((it) => {
    const category = classify(it.title);
    const age = it.publishedAt ? Math.max(0, newest - it.publishedAt) : WINDOW_MS;
    const recencyBonus = Math.max(0, Math.round(20 * (1 - Math.min(1, age / WINDOW_MS))));
    const impact = Math.max(0, Math.min(100, CATEGORY_BASE[category] + recencyBonus));
    return {
      title: it.title,
      source: it.source,
      sentiment: scoreHeadline(it.title),
      btcWindow: ago(it.publishedAt),
      url: it.link || undefined,
      description: it.description,
      category,
      impact,
      impactTier: impactTier(impact),
      publishedAt: it.publishedAt,
    };
  });

  // A news wire must surface the newest stories before heuristic impact.
  scored.sort((a, b) => b.publishedAt - a.publishedAt || b.impact - a.impact);

  return {
    data: scored.slice(0, limit),
    asOf: feeds.map((f) => f.fetchedAt).filter((value): value is string => !!value).sort().at(-1)!,
    synthetic: false,
  };
}
