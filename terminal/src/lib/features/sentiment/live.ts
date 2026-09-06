/**
 * Live social/market sentiment — headline tone across merged public RSS feeds
 * (keyword heuristic, see `sources/lexicon.ts`), blended with the alternative.me
 * Fear & Greed reading. No Twitter/X involved; the panel footnote says "rss".
 */
import { getCryptoNews } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import { getFearGreed } from '@/lib/sources/alternativeme';
import type { SentimentData, SentimentArgs } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export async function fetchSentiment({ days = 7 }: SentimentArgs) {
  void days;

  const items = await getCryptoNews(40);
  if (!items.length) return null;

  let pos = 0;
  let neg = 0;
  let neu = 0;
  for (const it of items) {
    const s = scoreHeadline(it.title);
    if (s === 'positive') pos++;
    else if (s === 'negative') neg++;
    else neu++;
  }
  const total = items.length;

  const newsScore = clamp((pos - neg) / total, -1, 1);

  const fng = await getFearGreed(1).catch(() => null);
  const fngVal = fng && fng.length ? fng[0].value : null;
  const score =
    fngVal === null
      ? newsScore
      : clamp(0.6 * newsScore + 0.4 * ((fngVal - 50) / 50), -1, 1);

  const data: SentimentData = {
    positivePct: (pos / total) * 100,
    negativePct: (neg / total) * 100,
    neutralPct: (neu / total) * 100,
    score,
  };

  return {
    data,
    asOf: new Date().toISOString(),
    synthetic: false,
  };
}
