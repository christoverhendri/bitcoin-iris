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
  /** Large payloads cached after normalization must bypass Next's raw cache. */
  cache?: 'no-store';
  allowNotModified?: boolean;
}

async function read<T>(url: string, opts: FetchOpts, parse: (res: Response) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'user-agent': UA, accept: '*/*', ...opts.headers },
      ...(opts.cache === 'no-store' ? { cache: 'no-store' as const } : { next: { revalidate: opts.revalidate } }),
    });
    if (!res.ok && !(opts.allowNotModified && res.status === 304)) {
      throw new UpstreamError(res.status, res.headers.get('retry-after'), `GET ${shorten(url)} -> ${res.status}`);
    }
    // Keep the abort timer active until the body has been consumed too.
    return await parse(res);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch and parse JSON. Throws on non-2xx, timeout, or invalid JSON. */
export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  return read(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } },
    async (res) => (await res.json()) as T);
}

/** Fetch raw text (RSS/XML). Throws on non-2xx or timeout. */
export async function fetchText(url: string, opts: FetchOpts): Promise<string> {
  return read(url, opts, (res) => res.text());
}

function shorten(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url.slice(0, 80);
  }
}

export class UpstreamError extends Error {
  constructor(public status: number, public retryAfter: string | null, message: string) { super(message); }
}

export function retryDelay(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function fetchRss(url: string, headers: Record<string, string>) {
  return read(url, { revalidate: 0, cache: 'no-store', allowNotModified: true, headers }, async (res) => ({
    status: res.status, text: res.status === 304 ? '' : await res.text(),
    etag: res.headers.get('etag'), modified: res.headers.get('last-modified'),
  }));
}
