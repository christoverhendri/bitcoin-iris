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

/**
 * Map marker radius (SVG user units). One size for every event: marker size
 * used to encode an "impact" score, which had no basis and was removed.
 */
export const MARKER_RADIUS = 4.5;

/**
 * Headline tone words. The labels come from the sentiment model (Financial
 * DistilRoBERTa, `services/sentiment-node`), which classifies the TEXT as
 * positive / neutral / negative and is explicitly not a BTC price forecast —
 * so the words say POSITIF / NEGATIF, not BULLISH / BEARISH (2026-10-18).
 */
const SENTIMENT_LABEL: Record<GeoEvent['sentiment'], string> = {
  positive: 'POSITIF',
  negative: 'NEGATIF',
  neutral: 'NETRAL',
};

export type SentimentWord = 'POSITIF' | 'NEGATIF' | 'NETRAL';

/** Event sentiment -> display word used in the detail popup and wire. */
export function sentimentWord(s: GeoEvent['sentiment']): SentimentWord {
  return s === 'positive' ? 'POSITIF' : s === 'negative' ? 'NEGATIF' : 'NETRAL';
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
  };
}
