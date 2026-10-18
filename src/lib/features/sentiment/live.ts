/**
 * Shared headline predictions, plus the existing Fear & Greed score blend.
 * Model provenance, review coverage and TF-IDF distribution stay explicit.
 */
import { getAnalyzedCryptoNews } from '@/lib/sentiment/news';
import { sentimentSource } from '@/lib/sentiment/types';
import { getFearGreed } from '@/lib/sources/alternativeme';
import type { SentimentData, SentimentArgs } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export async function fetchSentiment({ days = 7 }: SentimentArgs) {
  void days;

  const items = await getAnalyzedCryptoNews();
  if (!items.length) return null;

  let pos = 0;
  let neg = 0;
  let neu = 0;
  for (const it of items) {
    const s = it.assessment.label;
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
    analysis: {
      source: [...new Set(items.map((it) => sentimentSource(it.assessment)))].join(' / '),
      sampleSize: total,
      modelCount: items.filter((it) => it.assessment.status === 'ready').length,
      reviewCount: items.filter((it) => it.assessment.needsReview).length,
      baseline: items.every((it) => it.assessment.baseline) ? {
        positivePct: items.filter((it) => it.assessment.baseline!.label === 'positive').length / total * 100,
        negativePct: items.filter((it) => it.assessment.baseline!.label === 'negative').length / total * 100,
        neutralPct: items.filter((it) => it.assessment.baseline!.label === 'neutral').length / total * 100,
      } : undefined,
      scoreBasis: fngVal === null ? 'news-only' : 'news-and-fear-greed',
    },
  };

  return {
    data,
    asOf: new Date().toISOString(),
    synthetic: false,
  };
}
