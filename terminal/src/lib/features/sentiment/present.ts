import { fmtPct, fmtZ } from '@/lib/format';
import type { SentimentData } from './types';

export function toSentimentLabels(s: SentimentData) {
  return {
    positive: fmtPct(s.positivePct, false),
    negative: fmtPct(s.negativePct, false),
    neutral: fmtPct(s.neutralPct, false),
    score: fmtZ(s.score),
  };
}

export function getSentimentColor(score: number): string {
  if (score > 0.3) return 'var(--up)';
  if (score < -0.3) return 'var(--down)';
  return 'var(--mut)';
}
