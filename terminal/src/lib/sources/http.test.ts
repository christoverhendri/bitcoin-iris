import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText, fetchRss, retryDelay, UpstreamError } from './http';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('upstream HTTP timeouts', () => {
  it.each(['json', 'text'] as const)('aborts a stalled %s body after headers arrive', async (format) => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      signal = options.signal;
      return { ok: true, [format]: () => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
      }) };
    }));
    const request = format === 'json'
      ? fetchJson('https://example.test/data', { revalidate: 60, timeoutMs: 100 })
      : fetchText('https://example.test/feed', { revalidate: 60, timeoutMs: 100 });
    const assertion = expect(request).rejects.toThrow('body aborted');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bypasses raw caching without a conflicting revalidation directive', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchJson('https://example.test/data', { revalidate: 300, cache: 'no-store' })).toEqual({ ok: true });
    const options = fetch.mock.calls[0][1];
    expect(options.cache).toBe('no-store');
    expect(options.next).toBeUndefined();
  });
});

it('accepts an HTTP 304 and retains validator metadata', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { etag: 'v1' } })));
  expect(await fetchRss('https://example.test/rss', {})).toMatchObject({ status: 304, text: '', etag: 'v1' });
});
it('preserves rate-limit metadata and parses Retry-After dates', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '900' } })));
  await expect(fetchRss('https://example.test/rss', {})).rejects.toBeInstanceOf(UpstreamError);
  expect(retryDelay('900')).toBe(900000);
  expect(retryDelay('Sun, 06 Sep 2026 01:00:00 GMT', Date.parse('2026-09-06T00:00:00Z'))).toBe(3600000);
});
