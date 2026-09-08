import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  offline: false,
  crypto: [] as { title: string; link: string; publishedAt: number; source: string; description: string }[],
}));

vi.mock('@/lib/sources/rss', () => ({
  getCryptoNews: async () => {
    if (state.offline) throw new Error('crypto upstream unavailable');
    return state.crypto;
  },
}));

vi.mock('@/lib/sources/http', () => ({
  fetchText: async () => { throw new Error('upstream unavailable'); },
}));

import { fetchGeopoliticalEvents } from './live';

beforeEach(() => {
  state.offline = false;
  state.crypto = [];
});

it('returns no events when every upstream is unavailable', async () => {
  state.offline = true;
  await expect(fetchGeopoliticalEvents({ limit: 60 })).resolves.toBeNull();
});

it('does not pad an empty news feed with reference calendar markers', async () => {
  await expect(fetchGeopoliticalEvents({ limit: 60 })).resolves.toBeNull();
});

it('keeps a real located article when broader feeds are unavailable', async () => {
  state.crypto = [{
    title: 'Bitcoin exchange hack reported in Tokyo',
    link: 'https://example.com/story',
    publishedAt: Date.parse('2026-09-08T00:00:00Z'),
    source: 'Test RSS',
    description: '',
  }];

  const result = await fetchGeopoliticalEvents({ limit: 60 });

  expect(result?.data).toHaveLength(1);
  expect(result?.data[0]).toMatchObject({
    headline: 'Bitcoin exchange hack reported in Tokyo',
    source: 'Test RSS',
    place: 'Japan',
    iso2: 'JP',
  });
  expect(result?.synthetic).toBe(false);
});
