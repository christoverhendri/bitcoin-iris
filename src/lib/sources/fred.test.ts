import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLatestAndZScore } from './fred';

/**
 * Pins the unit transform: an inflation *rate* is `pc1` of a price index. Without
 * it the panel rendered US core CPI's index level (~339) as "338.90%" inflation.
 */
describe('fred units', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stub(values: string[]) {
    // Typed so `mock.calls[0][0]` (the URL) is checkable.
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      new Response(
        JSON.stringify({ observations: values.map((v, i) => ({ date: `2026-0${9 - i}-01`, value: v })) }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('FRED_API_KEY', 'test-key');
    return fetchMock;
  }

  it('asks FRED for % change from a year ago when units = pc1', async () => {
    const fetchMock = stub(['2.56584', '2.44616', '.']);
    const r = await getLatestAndZScore('CPILFESL', 24, 'pc1');
    expect(String(fetchMock.mock.calls[0][0])).toContain('units=pc1');
    expect(r.latest).toBeCloseTo(2.56584, 5);
    expect(r.asOf).toBe('2026-09-01');
  });

  it('defaults to the series as published', async () => {
    const fetchMock = stub(['338.896']);
    await getLatestAndZScore('CPILFESL');
    expect(String(fetchMock.mock.calls[0][0])).toContain('units=lin');
  });
});

describe('macro freshness guard', () => {
  it('refuses series older than their frequency allows', async () => {
    const { staleSeries } = await import('@/lib/features/macroCountry/live');
    const now = Date.parse('2026-10-17T00:00:00Z');
    const monthly = { id: 'M', units: 'lin' as const, maxAgeDays: 120 };
    const quarterly = { id: 'Q', units: 'pc1' as const, maxAgeDays: 200 };
    expect(staleSeries([{ ref: monthly, asOf: '2026-09-01' }], now)).toEqual([]);
    expect(staleSeries([{ ref: quarterly, asOf: '2026-04-01' }], now)).toEqual([]); // Q2, released late July
    expect(staleSeries([{ ref: monthly, asOf: '2021-06-01' }], now)).toEqual(['M (last 2021-06-01)']);
    expect(staleSeries([{ ref: quarterly, asOf: '2025-10-01' }], now)).toEqual(['Q (last 2025-10-01)']);
  });
});
