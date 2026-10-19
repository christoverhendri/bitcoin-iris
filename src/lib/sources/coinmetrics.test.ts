import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./http', () => ({ fetchJson: vi.fn() }));

const { fetchJson } = await import('./http');
const { getBtcDailyCloses } = await import('./coinmetrics');

const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2010, 6, 18 + i)).toISOString());

afterEach(() => vi.mocked(fetchJson).mockReset());

describe('getBtcDailyCloses', () => {
  it('reads Coin Metrics and follows next_page_url', async () => {
    const t = days(3200);
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ data: t.slice(0, 3000).map((time) => ({ time, PriceUSD: '1.5' })), next_page_url: 'https://next' })
      .mockResolvedValueOnce({ data: t.slice(3000).map((time) => ({ time, PriceUSD: '2' })) });
    const r = await getBtcDailyCloses();
    expect(r.source).toBe('Coin Metrics');
    expect(r.rows).toHaveLength(3200);
    expect(r.rows[0]).toEqual({ date: '2010-07-18', price: 1.5 });
    expect(vi.mocked(fetchJson).mock.calls[1][0]).toBe('https://next');
  });

  it('falls back to blockchain.com when Coin Metrics is unreachable', async () => {
    vi.mocked(fetchJson)
      .mockRejectedValueOnce(new Error('ENOTFOUND community-api.coinmetrics.io'))
      .mockResolvedValueOnce({ values: days(3100).map((iso, i) => ({ x: Date.parse(iso) / 1000, y: 100 + i })) });
    const r = await getBtcDailyCloses();
    expect(r.source).toBe('blockchain.com');
    expect(r.rows[1]).toEqual({ date: '2010-07-19', price: 101 });
  });

  it('throws when both fail (the feature then hides its panels; no 500)', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('offline'));
    await expect(getBtcDailyCloses()).rejects.toThrow('offline');
  });

  it('rejects a truncated history instead of drawing a short one', async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ data: days(10).map((time) => ({ time, PriceUSD: '1' })) })
      .mockResolvedValueOnce({ values: [] });
    await expect(getBtcDailyCloses()).rejects.toThrow();
  });
});
