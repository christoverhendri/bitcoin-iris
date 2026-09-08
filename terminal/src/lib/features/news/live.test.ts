import { expect, it, vi } from 'vitest';
import type { RssItem } from '@/lib/sources/rss';
import fixture from '@/lib/sources/fixtures/semantic-news.json';
import { readSemanticNews } from '@/lib/sources/semanticNews';
import { newsAssessmentLabel, newsRankingLabel } from './present';
const watcher = vi.hoisted(() => ({ items: [] as RssItem[] }));
vi.mock('@/lib/sources/watcherGuru', () => ({ getWatcherGuruSnapshot: async () => watcher }));
vi.mock('@/lib/sources/rss', () => ({ getCryptoNewsSnapshot: async () => ({
  items: [
    { title: 'Exchange hack', publishedAt: 1000, source: 'A', link: 'https://example.com/a', description: '' },
    { title: 'Bitcoin trading update', publishedAt: 2000, source: 'B', link: 'https://example.com/b', description: '' },
    { title: 'Undated story', publishedAt: 0, source: 'B', link: 'https://example.com/c', description: '' },
  ], feeds: [{ fetchedAt: '2026-09-06T02:00:00Z' }],
}) }));
import { fetchNews } from './live';
it('puts newer stories ahead of high-impact older ones and separates fetch time from publication', async () => {
  const result = await fetchNews({ limit: 3 });
  expect(result?.data.map((a) => a.publishedAt)).toEqual([2000, 1000, 0]);
  expect(result?.asOf).toBe('2026-09-06T02:00:00Z');
  expect(result?.data[2].btcWindow).toBe('date unavailable');
});

it('uses semantic event topics and weights without inventing market sentiment or impact', async () => {
  watcher.items = fixture.records.map(record => ({
    title: record.raw_text, description: record.raw_text, publishedAt: Date.parse(record.published_at),
    source: 'Watcher.Guru', link: `https://t.me/WatcherGuru/${record.source_id}`,
    semantic: readSemanticNews(record.raw_text, record.semantic_parse, record.weighting),
  }));
  try {
    const result = await fetchNews({ limit: 20 });
    const parsed = result!.data.filter(article => article.semantic);
    expect(parsed).toHaveLength(7);
    expect(parsed.every(article => article.sentiment === 'neutral' && article.impact === null && article.impactTier === null)).toBe(true);
    const negated = parsed.find(article => article.url?.endsWith('/1'))!;
    expect(negated.category).toBe('REGULATION');
    expect(newsAssessmentLabel(negated)).toBe('REVIEW');
    expect(newsRankingLabel(negated)).toBe('WEIGHT 0.500');
    expect(newsAssessmentLabel(parsed.find(article => article.url?.endsWith('/2'))!)).toBe('NO DIRECTION');
    expect(result!.data.find(article => article.source === 'A')?.sentiment).toBe('negative');
  } finally { watcher.items = []; }
});
it('classifies Watcher.Guru through the same headline rules and merges by publication', async () => {
  watcher.items = [{ title: 'Exchange hack', publishedAt: 3000, source: 'Watcher.Guru', link: 'https://t.me/WatcherGuru/1', description: 'Exchange hack' }];
  try {
    const result = await fetchNews({ limit: 4 });
    expect(result?.data[0]).toMatchObject({ source: 'Watcher.Guru', sentiment: 'negative', category: 'SECURITY', impactTier: 'HIGH' });
    expect(result?.data[0].sentiment).toBe(result?.data.find(a => a.source === 'A')?.sentiment);
  } finally { watcher.items = []; }
});
