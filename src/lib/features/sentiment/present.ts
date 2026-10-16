import { fmtPct } from '@/lib/format';
import type { SentimentData } from './types';

export function toSentimentLabels(s: SentimentData) {
  return {
    positive: fmtPct(s.positivePct, false),
    negative: fmtPct(s.negativePct, false),
    neutral: fmtPct(s.neutralPct, false),
    headlines: String(s.headlineCount),
  };
}
