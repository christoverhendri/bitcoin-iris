import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, responseAgeSec, staleLimitSec } from './http';

const NOW = Date.parse('2026-10-18T09:00:00Z');

function reply(dateIso: string) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { date: new Date(dateIso).toUTCString(), 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('stale-cache guard', () => {
  it('measures a response by its date header', () => {
    expect(responseAgeSec(reply('2026-10-18T08:50:00Z'), NOW)).toBe(600);
    expect(responseAgeSec(new Response('x'), NOW)).toBeNull();
    expect(staleLimitSec(30)).toBe(300);
    expect(staleLimitSec(3600)).toBe(14_400);
  });

  it('serves a recent cached response as is', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const f = vi.fn(async () => reply('2026-10-18T08:58:00Z'));
    vi.stubGlobal('fetch', f);
    await expect(fetchJson('https://x.test/a', { revalidate: 60 })).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refetches past the limit, and throws when the upstream is really down', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // First call: a two-day-old cached copy. Second (cache bypassed): network error.
    const f = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reply('2026-10-16T09:00:00Z'))
      .mockRejectedValueOnce(new Error('ENOTFOUND'));
    vi.stubGlobal('fetch', f);
    await expect(fetchJson('https://x.test/b', { revalidate: 60 })).rejects.toThrow(/cached copy is 2880 min old/);
    expect(f.mock.calls[1][1]?.cache).toBe('no-store');
  });

  it('uses the fresh refetch when the upstream answers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const f = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reply('2026-10-16T09:00:00Z'))
      .mockResolvedValueOnce(reply('2026-10-18T09:00:00Z'));
    vi.stubGlobal('fetch', f);
    await expect(fetchJson('https://x.test/c', { revalidate: 60 })).resolves.toEqual({ ok: true });
  });
});
