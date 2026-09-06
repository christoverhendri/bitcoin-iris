import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const { fetchRss } = vi.hoisted(() => ({ fetchRss: vi.fn() }));
vi.mock('./http', async (original) => ({ ...await original<typeof import('./http')>(), fetchRss }));
vi.mock('./newsArchive', async (original) => ({ ...await original<typeof import('./newsArchive')>(), createArchiveStore: () => ({ load: async () => undefined, save: async () => {} }) }));
const xml = (title = 'Bitcoin update') => `<rss><channel><item><title><![CDATA[${title}]]></title><link>https://example.com/story</link><pubDate>Sun, 06 Sep 2026 01:00:00 GMT</pubDate></item></channel></rss>`;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T02:00:00Z'));
  fetchRss.mockReset().mockResolvedValue({ status: 200, text: xml(), etag: 'v1' });
});
afterEach(() => vi.useRealTimers());

it('deduplicates concurrent downloads and caches the shared feed batch for five minutes', async () => {
  const { getCryptoNewsSnapshot } = await import('./rss');
  const [first] = await Promise.all([getCryptoNewsSnapshot(), getCryptoNewsSnapshot(40)]);
  expect(fetchRss).toHaveBeenCalledTimes(4);
  expect(first.items).toHaveLength(1);
  await getCryptoNewsSnapshot();
  expect(fetchRss).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(300_001);
  await getCryptoNewsSnapshot();
  expect(fetchRss).toHaveBeenCalledTimes(8);
});

it('retains real stories on failure, exposes stale status, then recovers', async () => {
  const { getCryptoNewsSnapshot } = await import('./rss');
  const first = await getCryptoNewsSnapshot();
  vi.advanceTimersByTime(300_001);
  fetchRss.mockRejectedValue(new Error('offline'));
  const stale = await getCryptoNewsSnapshot();
  expect(stale.items).toEqual(first.items);
  expect(stale.feeds.every((f) => f.status === 'stale')).toBe(true);
  expect(stale.feeds[0].fetchedAt).toBe(first.feeds[0].fetchedAt);
  vi.advanceTimersByTime(300_001);
  fetchRss.mockResolvedValue({ status: 200, text: xml('Recovered headline') });
  const recovered = await getCryptoNewsSnapshot();
  expect(recovered.feeds.every((f) => f.status === 'ok')).toBe(true);
  expect(recovered.items[0].title).toBe('Recovered headline');
});

it('expires retained stories after 24 hours without inventing replacements', async () => {
  const { getCryptoNewsSnapshot } = await import('./rss');
  await getCryptoNewsSnapshot();
  vi.advanceTimersByTime(86_400_001);
  fetchRss.mockResolvedValue({ status: 200, text: '<html>Access denied</html>' });
  const result = await getCryptoNewsSnapshot();
  expect(result.items).toEqual([]);
  expect(result.feeds.every((f) => f.status === 'unavailable')).toBe(true);
});

it('accepts partial success and rejects unsafe story URLs', async () => {
  const { getCryptoNewsSnapshot } = await import('./rss');
  fetchRss.mockRejectedValue(new Error('offline'))
    .mockResolvedValueOnce({ status: 200, text: xml().replace('https://example.com/story', 'javascript:alert(1)') })
    .mockResolvedValueOnce({ status: 200, text: xml('Real article') });
  const result = await getCryptoNewsSnapshot();
  expect(result.items.map((i) => i.title)).toEqual(['Real article']);
  expect(result.feeds.filter((f) => f.status === 'ok')).toHaveLength(1);
});

it('uses validators for 304 and preserves articles', async () => {
  const { getCryptoNewsSnapshot } = await import('./rss');
  const initial = await getCryptoNewsSnapshot();
  vi.advanceTimersByTime(300_001);
  fetchRss.mockResolvedValue({ status: 304, text: '' });
  const next = await getCryptoNewsSnapshot();
  expect(next.items).toEqual(initial.items);
  expect(fetchRss).toHaveBeenLastCalledWith(expect.any(String), { 'if-none-match': 'v1' });
});
it('honors Retry-After across multiple refresh attempts', async () => {
  const { UpstreamError } = await import('./http');
  const { getCryptoNewsSnapshot } = await import('./rss');
  fetchRss.mockRejectedValue(new UpstreamError(429, '1800', 'rate limited'));
  await getCryptoNewsSnapshot();
  vi.advanceTimersByTime(300_001);
  await getCryptoNewsSnapshot();
  expect(fetchRss).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(1_500_000);
  await getCryptoNewsSnapshot();
  expect(fetchRss).toHaveBeenCalledTimes(8);
});
