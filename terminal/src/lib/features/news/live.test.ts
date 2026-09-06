import { expect, it, vi } from 'vitest';
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
