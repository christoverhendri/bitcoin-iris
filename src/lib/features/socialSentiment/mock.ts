import { seeded, utcDay } from '@/lib/rng';
import type { SocialSentimentArgs, SocialSentimentData, SocialSentimentDay } from './types';

const DAY_MS = 86_400_000;
/** Mirrors the free-plan delay the live data carries. */
const MOCK_LAG_DAYS = 30;

export function mockSocialSentiment({ days = 30 }: SocialSentimentArgs): SocialSentimentData {
  const r = seeded('socialSentiment');
  const end = Date.parse(`${utcDay()}T00:00:00Z`) - MOCK_LAG_DAYS * DAY_MS;
  const history: SocialSentimentDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const pos = 0.4 + r() * 0.15;
    const neu = 0.12 + r() * 0.08;
    const neg = Math.max(0, 1 - pos - neu);
    history.push({
      date: new Date(end - i * DAY_MS).toISOString().slice(0, 10),
      positive: pos,
      neutral: neu,
      negative: neg,
    });
  }
  return {
    latest: history[history.length - 1],
    history,
    sources: ['twitter', 'reddit', 'telegram', '4chan'],
    lagDays: MOCK_LAG_DAYS,
  };
}
