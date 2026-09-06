import { fmtAgo } from '@/lib/format';
import type { EventCategory } from '@/lib/geo/classify';
import type { GeoEvent } from './types';

/** Category -> map marker / rail colour, all theme tokens. */
export const CATEGORY_COLOR: Record<EventCategory, string> = {
  REGULATION: 'var(--amber)',
  ETF_FUND: 'var(--blue)',
  SECURITY: 'var(--down)',
  MONETARY: 'var(--purple)',
  GEOPOLITICS: 'var(--down)',
  ADOPTION: 'var(--up)',
  LEGAL: 'var(--mut)',
  MARKET: 'var(--blue)',
  WHALE_FLOW: 'var(--purple)',
};

/** Impact 0..100 -> marker radius 2.5..7 (SVG user units). */
export function impactRadius(impact: number): number {
  const clamped = Math.max(0, Math.min(100, impact));
  return 2.5 + (clamped / 100) * 4.5;
}

const SENTIMENT_LABEL: Record<GeoEvent['sentiment'], string> = {
  positive: 'BULL',
  negative: 'BEAR',
  neutral: 'NEUTRAL',
};

export type ImpactTier = 'HIGH' | 'MEDIUM' | 'LOW';

/** Impact 0..100 -> tier. HIGH > 65, MEDIUM 40..65, LOW < 40. */
export function impactTier(impact: number): ImpactTier {
  if (impact > 65) return 'HIGH';
  if (impact >= 40) return 'MEDIUM';
  return 'LOW';
}

/** Tier -> theme token. Terminal palette only, no neon. */
export const IMPACT_TIER_COLOR: Record<ImpactTier, string> = {
  HIGH: 'var(--down)',
  MEDIUM: 'var(--amber)',
  LOW: 'var(--mut)',
};

export type SentimentWord = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** Event sentiment -> display word used in the detail popup and wire. */
export function sentimentWord(s: GeoEvent['sentiment']): SentimentWord {
  return s === 'positive' ? 'BULLISH' : s === 'negative' ? 'BEARISH' : 'NEUTRAL';
}

/** Flattened, display-ready fields for one event row. */
export function toEventRow(e: GeoEvent, now?: number) {
  return {
    id: e.id,
    headline: e.headline,
    source: e.source,
    place: e.place,
    category: e.category,
    color: CATEGORY_COLOR[e.category],
    sentiment: e.sentiment,
    sentimentLabel: SENTIMENT_LABEL[e.sentiment],
    ago: fmtAgo(new Date(e.publishedAt).toISOString(), now),
    impact: Math.round(e.impact),
  };
}
