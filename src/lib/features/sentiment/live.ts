/**
 * Live headline mix — how many of the latest RSS headlines are positive,
 * negative or neutral. Labels come from the researcher's sentiment worker
 * (Financial DistilRoBERTa + parser V3, `services/sentiment-node`); when it is
 * unreachable each headline falls back to the keyword lexicon and says so
 * ("Heuristic · model unavailable"). A count, nothing more.
 *
 * There is no blended "sentiment score": the one that used to sit here weighted
 * this tally 0.6 against Fear & Greed 0.4, with nothing behind either weight,
 * and was removed on 2026-10-16. The model branch re-added it; it stays out.
 * Fear & Greed is shown on its own.
 */
import { getAnalyzedCryptoNews } from '@/lib/sentiment/news';
import { sentimentSource } from '@/lib/sentiment/types';
import type { SentimentData, SentimentArgs } from './types';

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

  const data: SentimentData = {
    positivePct: (pos / total) * 100,
    negativePct: (neg / total) * 100,
    neutralPct: (neu / total) * 100,
    headlineCount: total,
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
    },
  };

  return {
    data,
    // Newest headline the counts were taken over.
    asOf: items[0]?.publishedAt ? new Date(items[0].publishedAt).toISOString() : null,
    synthetic: false,
  };
}
