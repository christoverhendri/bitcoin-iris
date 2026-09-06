/**
 * Live Fear & Greed — alternative.me. Newest point is the current reading;
 * `changePct` is its move versus the previous day.
 */
import { getFearGreed } from '@/lib/sources/alternativeme';
import type { FearGreedData, FearGreedArgs } from './types';

const CLASSES: FearGreedData['classification'][] = [
  'Extreme Fear',
  'Fear',
  'Neutral',
  'Greed',
  'Extreme Greed',
];

function normalize(raw: string): FearGreedData['classification'] {
  const hit = CLASSES.find((c) => c.toLowerCase() === raw.toLowerCase());
  return hit ?? 'Neutral';
}

export async function fetchFearGreed(_args: FearGreedArgs) {
  void _args;
  const points = await getFearGreed(30);
  if (!points.length) return null;

  const [current, prev] = points;
  const changePct =
    prev && prev.value > 0 ? ((current.value - prev.value) / prev.value) * 100 : 0;

  return {
    data: {
      value: current.value,
      classification: normalize(current.classification),
      changePct,
    },
    asOf: new Date(current.timestamp).toISOString(),
    synthetic: false,
  };
}
