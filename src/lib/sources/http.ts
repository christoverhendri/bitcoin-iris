/**
 * Server-only HTTP helpers for the live data path.
 *
 * Every `live.ts` that reaches an upstream API goes through one of these. They
 * add three things the raw `fetch` does not: a hard timeout (a hung upstream
 * must not hang the page), a browser-ish User-Agent (some feeds 403 the default
 * one), and Next's time-based cache so repeated renders inside the revalidate
 * window cost one request, not one per panel.
 *
 * On any non-2xx or network error these throw. `defineFeature` catches that and
 * falls back to the mock layer with `reason: 'query_error'`, so a dead upstream
 * degrades to a badged placeholder instead of a 500.
 *
 * Stale-cache guard (2026-10-18). When revalidation fails, Next keeps serving the
 * last good response from its data cache — so an unreachable upstream (an ISP
 * DNS block, an outage) looked live for days and no fallback ever ran. The
 * cached response keeps its original `date` header, so its age is checkable:
 * past `staleLimitSec(revalidate)` we refetch once bypassing the cache, and if
 * that fails we throw, which lets the caller's fallback source take over.
 */

const UA =
  'Mozilla/5.0 (compatible; IRIS-Terminal/1.0; +https://github.com/) AppleWebKit/537.36';

const DEFAULT_TIMEOUT_MS = 9_000;

export interface FetchOpts {
  /** Seconds Next may serve this response from cache before refetching. */
  revalidate: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Override the abort timeout. */
  timeoutMs?: number;
}

/**
 * How old a cached response may be before it counts as stale: four revalidate
 * windows (Next serves one stale copy while it refreshes in the background, so
 * one window of lag is normal), never less than five minutes.
 */
export function staleLimitSec(revalidate: number): number {
  return Math.max(revalidate * 4, 300);
}

/** Seconds since the response's `date` header, or `null` without one. */
export function responseAgeSec(res: Pick<Response, 'headers'>, now = Date.now()): number | null {
  const d = res.headers.get('date');
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 1000) : null;
}

async function once(url: string, opts: FetchOpts, bypassCache: boolean): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'user-agent': UA, accept: '*/*', ...opts.headers },
      ...(bypassCache ? { cache: 'no-store' as const } : { next: { revalidate: opts.revalidate } }),
    });
    if (!res.ok) {
      throw new Error(`GET ${shorten(url)} -> ${res.status} ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function raw(url: string, opts: FetchOpts): Promise<Response> {
  const res = await once(url, opts, false);
  const age = responseAgeSec(res);
  if (age === null || age <= staleLimitSec(opts.revalidate)) return res;
  // An old cache entry: the upstream has not been reached for a while. Try it
  // directly; if it is really down, say so instead of serving the old copy.
  try {
    return await once(url, opts, true);
  } catch (err) {
    throw new Error(
      `GET ${shorten(url)}: cached copy is ${Math.round(age / 60)} min old and a fresh fetch failed (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
}

/** Fetch and parse JSON. Throws on non-2xx, timeout, or invalid JSON. */
export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const res = await raw(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  return (await res.json()) as T;
}

/** Fetch raw text (RSS/XML). Throws on non-2xx or timeout. */
export async function fetchText(url: string, opts: FetchOpts): Promise<string> {
  const res = await raw(url, opts);
  return res.text();
}

function shorten(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url.slice(0, 80);
  }
}
