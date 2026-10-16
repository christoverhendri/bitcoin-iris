/**
 * Live headline mix — how many of the latest RSS headlines the keyword lexicon
 * (`sources/lexicon.ts`) tags positive, negative or neutral. A count, nothing
 * more. No Twitter/X involved; the panel footnote says "rss".
 *
 * There is no blended "sentiment score": the one that used to sit here weighted
 * this tally 0.6 against Fear & Greed 0.4, with nothing behind either weight,
 * and was removed on 2026-10-16. Fear & Greed is shown on its own.
 */
import { getCryptoNews } from '@/lib/sources/rss';
import { scoreHeadline } from '@/lib/sources/lexicon';
import type { SentimentData, SentimentArgs } from './types';

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

  const data: SentimentData = {
    positivePct: (pos / total) * 100,
    negativePct: (neg / total) * 100,
    neutralPct: (neu / total) * 100,
    headlineCount: total,
  };

  return {
    data,
    asOf: new Date().toISOString(),
    synthetic: false,
  };
}
