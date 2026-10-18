import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from './fixtures/worker.json';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/sources/rss', () => ({ getCryptoNews: vi.fn() }));
vi.mock('@/lib/sources/alternativeme', () => ({ getFearGreed: vi.fn() }));

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('IRIS_SENTIMENT_PROFILE', 'challenger');
  const { getCryptoNews } = await import('@/lib/sources/rss');
  vi.mocked(getCryptoNews).mockResolvedValue(fixture.rows.map((r) => ({ title: r.prediction.raw_text,
    link: `https://example.test/${r.id}`, description: 'Integration test article', source: 'TEST', publishedAt: Date.now() })));
  const { getFearGreed } = await import('@/lib/sources/alternativeme');
  vi.mocked(getFearGreed).mockResolvedValue([{ value: 50, classification: 'Neutral', timestamp: Date.now() }]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('news labels and sentiment mix use the same predictions, baseline and shared request', async () => {
  const { fetchNews } = await import('@/lib/features/news/live');
  const { fetchSentiment } = await import('@/lib/features/sentiment/live');
  const [news, sentiment] = await Promise.all([fetchNews({ limit: 40 }), fetchSentiment({ days: 7 })]);
  expect(news!.data.map((r) => r.sentiment).sort()).toEqual(['negative', 'neutral']);
  expect(sentiment!.data).toMatchObject({ positivePct: 0, neutralPct: 50, negativePct: 50,
    analysis: { sampleSize: 2, modelCount: 2, reviewCount: 2, baseline: { positivePct: 100, negativePct: 0, neutralPct: 0 } } });
  // No blended news + Fear & Greed score: removed from the dashboard on 2026-10-16.
  expect(sentiment!.data.headlineCount).toBe(2);
  expect(sentiment!.data).not.toHaveProperty('score');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps live RSS data with explicit heuristic provenance when worker fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Worker offline'); }));
  const { fetchNews } = await import('@/lib/features/news/live');
  const { fetchSentiment } = await import('@/lib/features/sentiment/live');
  const [news, sentiment] = await Promise.all([fetchNews({}), fetchSentiment({})]);
  expect(news!.synthetic).toBe(false);
  expect(news!.data[0].sentimentAssessment?.status).toBe('unavailable');
  expect(sentiment!.data.analysis?.source).toContain('model unavailable');
  expect(sentiment!.data.analysis?.modelCount).toBe(0);
  expect(sentiment!.data.analysis?.baseline).toBeUndefined();
});
