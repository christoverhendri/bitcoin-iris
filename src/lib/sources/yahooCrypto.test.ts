import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCandles as krakenChain } from './kraken';
import { getCandles, getStats24h } from './yahooCrypto';

/**
 * The Yahoo tier only runs when Kraken is down, so in normal operation nothing
 * exercises it. These pin the two things that would break silently: the
 * Kraken -> Yahoo hand-off, and the 1h -> 4h aggregation Yahoo forces on us.
 */

const H = 3600;

function chart(ts: number[], close: (number | null)[]) {
  return {
    chart: {
      result: [
        {
          timestamp: ts,
          indicators: {
            quote: [
              {
                open: close.map((c) => (c == null ? null : c - 1)),
                high: close.map((c) => (c == null ? null : c + 2)),
                low: close.map((c) => (c == null ? null : c - 2)),
                close,
                volume: close.map(() => 10),
              },
            ],
          },
        },
      ],
    },
  };
}

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = handler(url);
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('yahooCrypto', () => {
  it('drops null closes instead of zero-filling them', async () => {
    stubFetch(() => chart([0, 86400, 172800], [100, null, 102]));
    const c = await getCandles('1d');
    expect(c.map((x) => x.close)).toEqual([100, 102]);
  });

  it('builds 4h bars from 1h bars', async () => {
    const ts = Array.from({ length: 8 }, (_, i) => i * H);
    stubFetch(() => chart(ts, [1, 2, 3, 4, 5, 6, 7, 8]));
    const c = await getCandles('4h');
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ ts: 0, open: 0, close: 4, high: 6, low: -1, volume: 40 });
    expect(c[1]).toMatchObject({ ts: 4 * H, close: 8 });
  });

  it('derives 24h stats from the last 24 hourly bars', async () => {
    const ts = Array.from({ length: 30 }, (_, i) => i * H);
    const closes = ts.map((_, i) => 100 + i);
    stubFetch(() => chart(ts, closes));
    const s = await getStats24h();
    expect(s.last).toBe(129);
    expect(s.open).toBe(105); // open of bar 6 = close 106 - 1
    expect(s.high).toBe(131);
    expect(s.low).toBe(104);
  });
});

describe('kraken chain', () => {
  it('falls back to Yahoo BTC-USD when Kraken is unreachable', async () => {
    stubFetch((url) =>
      url.includes('kraken.com') ? new Error('ECONNRESET') : chart([0, 86400], [50, 51]),
    );
    const c = await krakenChain('1d', 'XBTUSD');
    expect(c.map((x) => x.close)).toEqual([50, 51]);
  });

  it('does not substitute BTC prices for another pair', async () => {
    stubFetch((url) => (url.includes('kraken.com') ? new Error('ECONNRESET') : chart([0], [1])));
    await expect(krakenChain('1d', 'ETHUSD')).rejects.toThrow();
  });
});
