import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/worker.json';

vi.mock('server-only', () => ({}));
const texts = fixture.rows.map((r) => r.prediction.raw_text);
const fetcher = vi.fn();
const response = (value: unknown = fixture) => new Response(JSON.stringify(value), { status: 200 });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('IRIS_SENTIMENT_PROFILE', 'challenger');
  vi.stubEnv('IRIS_SENTIMENT_URL', 'http://127.0.0.1:8765');
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    const ids = new Set(body.articles.map((article: { id: string }) => article.id));
    return response({ ...fixture, rows: fixture.rows.filter((row) => ids.has(row.id)) });
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('worker adapter', () => {
  it('preserves parser-adjusted label and unmodified neural probabilities with baseline', async () => {
    const { analyzeHeadlines } = await import('./client');
    const rows = await analyzeHeadlines(texts);
    expect(rows[1]).toMatchObject({ engine: 'financial-v3', label: 'negative', modelLabel: 'neutral',
      baseline: { label: 'positive' }, scopeApplied: true, needsReview: true });
    expect(rows[1].probabilities).toEqual(fixture.rows[1].prediction.probabilities);
    expect(rows[0]).toMatchObject({ label: 'neutral', scopeApplied: false });
  });

  it('matches by content identity rather than response order', async () => {
    fetcher.mockImplementation(async () => response({ ...fixture, rows: [...fixture.rows].reverse() }));
    const { analyzeHeadlines } = await import('./client');
    expect((await analyzeHeadlines(texts)).map((r) => r.label)).toEqual(['neutral', 'negative']);
  });

  it('coalesces concurrent panel calls and delegates completed caching to the worker', async () => {
    const { analyzeHeadlines } = await import('./client');
    const [a, b] = await Promise.all([analyzeHeadlines(texts), analyzeHeadlines(texts)]);
    expect(a).toEqual(b);
    await analyzeHeadlines([texts[1]]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('selects TF-IDF only when baseline profile is explicit', async () => {
    vi.stubEnv('IRIS_SENTIMENT_PROFILE', 'baseline');
    const { analyzeHeadlines } = await import('./client');
    const rows = await analyzeHeadlines(texts);
    expect(rows.map((r) => r.engine)).toEqual(['tfidf', 'tfidf']);
    expect(rows.map((r) => r.label)).toEqual(['positive', 'positive']);
  });

  it('joins partially overlapping requests without processing the shared headline twice', async () => {
    fetcher.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const ids = new Set(body.articles.map((article: { id: string }) => article.id));
      return response({ ...fixture, rows: fixture.rows.filter((row) => ids.has(row.id)) });
    });
    const { analyzeHeadlines } = await import('./client');
    const [first, second] = await Promise.all([analyzeHeadlines(texts), analyzeHeadlines([texts[1]])]);
    expect(second[0]).toEqual(first[1]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    first[1].label = 'positive';
    expect((await analyzeHeadlines([texts[1]]))[0].label).toBe('negative');
  });

  it.each(['identity', 'missing', 'duplicate', 'probabilities', 'version', 'model-identity', 'parser-label'])('rejects malformed %s without pretending it is model output', async (kind) => {
    const data = structuredClone(fixture);
    if (kind === 'identity') data.rows[0].content_hash = 'wrong';
    if (kind === 'missing') data.rows.pop();
    if (kind === 'duplicate') data.rows[1] = data.rows[0];
    if (kind === 'probabilities') data.rows[0].prediction.probabilities.neutral = 12;
    if (kind === 'version') data.rows[0].prediction.sentiment_adjustment.rules_version = 'unknown';
    if (kind === 'model-identity') data.rows[0].prediction.model_id = 'unexpected-model';
    if (kind === 'parser-label') data.rows[0].prediction.sentiment = 'negative';
    fetcher.mockImplementation(async () => response(data));
    const { analyzeHeadlines } = await import('./client');
    expect((await analyzeHeadlines(texts)).every((r) => r.engine === 'heuristic' && r.status === 'unavailable')).toBe(true);
  });

  it('recovers on the next request without caching a fallback', async () => {
    fetcher.mockRejectedValueOnce(new Error('offline'));
    const { analyzeHeadlines } = await import('./client');
    expect((await analyzeHeadlines(texts))[0].status).toBe('unavailable');
    expect((await analyzeHeadlines(texts))[0].status).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('labels an intentional heuristic profile and never calls the worker', async () => {
    vi.stubEnv('IRIS_SENTIMENT_PROFILE', 'heuristic');
    const { analyzeHeadlines } = await import('./client');
    expect((await analyzeHeadlines(texts))[0]).toMatchObject({ engine: 'heuristic', status: 'disabled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
