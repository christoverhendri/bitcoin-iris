import type { SocialSentimentDay } from './types';

export type SentimentBucket = 'positive' | 'neutral' | 'negative';

/** Fixed order everywhere — legend, donut, bars — so a colour never changes meaning. */
export const BUCKETS: readonly SentimentBucket[] = ['positive', 'neutral', 'negative'];

/**
 * Diverging scheme: the app's bull/bear tokens at the poles, its muted grey as
 * the neutral midpoint. Every slice also carries a text label and its percent,
 * so identity never rests on red-vs-green alone.
 */
export const BUCKET_COLOR: Record<SentimentBucket, string> = {
  positive: 'var(--up)',
  neutral: 'var(--mut)',
  negative: 'var(--down)',
};

export const BUCKET_LABEL: Record<SentimentBucket, string> = {
  positive: 'POSITIVE',
  neutral: 'NEUTRAL',
  negative: 'NEGATIVE',
};

export const fmtShare = (x: number) => `${(x * 100).toFixed(1)}%`;

export interface DonutArc {
  bucket: SentimentBucket;
  share: number;
  /** SVG path for the ring segment. */
  d: string;
}

/**
 * Ring segments for one day, clockwise from 12 o'clock in `BUCKETS` order.
 * `gapRad` leaves a surface-coloured gap between segments (the 2px spacer the
 * chart spec asks for); a segment smaller than its gap is drawn as nothing.
 */
export function donutArcs(
  day: SocialSentimentDay,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  gapRad = 0.02,
): DonutArc[] {
  const total = BUCKETS.reduce((s, b) => s + Math.max(0, day[b]), 0) || 1;
  const pt = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  const out: DonutArc[] = [];
  let a0 = 0;
  for (const b of BUCKETS) {
    const share = Math.max(0, day[b]) / total;
    const span = share * 2 * Math.PI;
    const s = a0 + gapRad / 2;
    const e = a0 + span - gapRad / 2;
    a0 += span;
    if (e <= s) continue;
    const large = e - s > Math.PI ? 1 : 0;
    out.push({
      bucket: b,
      share,
      d:
        `M ${pt(rOuter, s)} A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, e)} ` +
        `L ${pt(rInner, e)} A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, s)} Z`,
    });
  }
  return out;
}

/** "positive share minus negative share", in points — the plain-language net tilt. */
export function netTilt(day: SocialSentimentDay): number {
  return (day.positive - day.negative) * 100;
}
