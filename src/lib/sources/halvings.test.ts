import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HALVINGS_FALLBACK } from '@/lib/quant/config';

vi.mock('./http', () => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
const { fetchJson, fetchText } = await import('./http');
const { getHalvings, getAverageBlockMinutes } = await import('./halvings');

/** Block hashes and timestamps recorded from mempool.space (see the fixture's note). */
const BLOCKS: { height: number; hash: string; timestamp: number }[] = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'halving-blocks.json'), 'utf8'),
).blocks;

function serveMempool() {
  vi.mocked(fetchText).mockImplementation(async (url: string) => {
    const h = Number(url.split('/').pop());
    const b = BLOCKS.find((x) => x.height === h);
    if (!b) throw new Error('404');
    return b.hash;
  });
  vi.mocked(fetchJson).mockImplementation(async (url: string) => {
    const b = BLOCKS.find((x) => url.endsWith(x.hash));
    if (!b) throw new Error('404');
    return { timestamp: b.timestamp };
  });
}

afterEach(() => {
  vi.mocked(fetchJson).mockReset();
  vi.mocked(fetchText).mockReset();
});

describe('halving dates from the chain', () => {
  it('the fallback list equals the block timestamps at each 210,000 height', async () => {
    serveMempool();
    const got = await getHalvings(972_106);
    expect(got.map(({ height, date }) => ({ height, date }))).toEqual(HALVINGS_FALLBACK);
    expect(got.every((h) => h.ts !== null)).toBe(true);
  });

  it('a fifth halving appears by itself once the tip reaches 1,050,000', async () => {
    serveMempool();
    vi.mocked(fetchText).mockImplementation(async (url: string) => {
      if (url.endsWith('/1050000')) return 'f'.repeat(64);
      return BLOCKS.find((x) => url.endsWith(`/${x.height}`))!.hash;
    });
    vi.mocked(fetchJson).mockImplementation(async (url: string) =>
      url.endsWith('f'.repeat(64)) ? { timestamp: Date.parse('2028-04-03T12:00:00Z') / 1000 } : { timestamp: BLOCKS.find((x) => url.endsWith(x.hash))!.timestamp },
    );
    const got = await getHalvings(1_050_001);
    expect(got).toHaveLength(5);
    expect(got[4]).toMatchObject({ height: 1_050_000, date: '2028-04-03' });
  });

  it('falls back to the tested list when no block API answers, but never invents a new halving', async () => {
    vi.mocked(fetchText).mockRejectedValue(new Error('offline'));
    vi.mocked(fetchJson).mockRejectedValue(new Error('offline'));
    const got = await getHalvings(972_106);
    expect(got.map((h) => h.date)).toEqual(HALVINGS_FALLBACK.map((h) => h.date));
    expect(got.every((h) => h.ts === null)).toBe(true);
    await expect(getHalvings(1_050_000)).rejects.toThrow();
  });

  it('live block time from mempool timeAvg (ms -> minutes)', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ timeAvg: 590_744 });
    expect(await getAverageBlockMinutes()).toBeCloseTo(9.8457, 4);
  });
});
