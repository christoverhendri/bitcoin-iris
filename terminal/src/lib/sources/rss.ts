/**
 * Crypto news via public RSS. Keyless. Every feed here returns RSS 2.0 with the
 * usual `<item><title><link><pubDate>` shape; a few wrap text in CDATA, which the
 * parser below unwraps.
 *
 * No XML dependency: RSS item structure is regular enough that a scoped regex is
 * more robust here than pulling in a parser that also has to handle Atom,
 * namespaces, and malformed HTML.
 */
import { unstable_rethrow } from 'next/navigation';
import { fetchRss, UpstreamError, retryDelay } from './http';
import { createArchiveStore, mergeHistory } from './newsArchive';

export interface RssItem {
  title: string;
  link: string;
  publishedAt: number; // ms epoch; 0 when the feed omitted a usable date
  source: string;
  /** First paragraph of the item body, tags stripped, capped. '' when absent. */
  description: string;
}

export interface FeedDef {
  source: string;
  url: string;
}

/** Feeds verified keyless and un-blocked from a datacentre IP. */
export const FEEDS: FeedDef[] = [
  { source: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' },
  { source: 'NewsBTC', url: 'https://www.newsbtc.com/feed/' },
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
];

function unwrap(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

export function parseFeed(xml: string, source: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const rawTitle = tag(block, 'title');
    const rawLink = tag(block, 'link');
    const rawDate = tag(block, 'pubDate') ?? tag(block, 'dc:date') ?? tag(block, 'published');
    const rawDesc =
      tag(block, 'description') ?? tag(block, 'content:encoded') ?? tag(block, 'summary');
    if (!rawTitle) continue;
    const parsed = rawDate ? Date.parse(unwrap(rawDate)) : NaN;
    const desc = rawDesc ? unwrap(rawDesc).replace(/\s+/g, ' ').trim() : '';
    items.push({
      title: unwrap(rawTitle),
      link: rawLink ? unwrap(rawLink) : '',
      publishedAt: Number.isFinite(parsed) ? parsed : 0,
      source,
      description: desc.length > 320 ? `${desc.slice(0, 317)}...` : desc,
    });
  }
  return items;
}

export interface FeedHealth {
  source: string;
  checkedAt: string;
  fetchedAt: string | null;
  status: 'ok' | 'stale' | 'unavailable';
  nextCheckAt?: string;
  newestPublishedAt?: string | null;
  archiveError?: boolean;
}

interface FeedEntry {
  items: RssItem[];
  history: RssItem[];
  health: FeedHealth;
  expires: number;
  failures: number;
  etag?: string | null;
  modified?: string | null;
}
const entries = new Map<string, FeedEntry>();
const pending = new Map<string, Promise<void>>();
const store = createArchiveStore();
export const RSS_INTERVAL_MS = 300_000;
const RETAIN_MS = 24 * 60 * 60 * 1000;

async function refreshFeed(feed: FeedDef) {
  if (pending.has(feed.url)) return pending.get(feed.url);
  const task = (async () => {
    let old = entries.get(feed.url);
    if (!old) {
      try { old = await store.load<FeedEntry>(feed.url); }
      catch (error) { console.error('[news-archive:read]', error); }
      if (old) entries.set(feed.url, old);
    }
    if (old && old.expires > Date.now()) return;
    const checkedAt = new Date().toISOString();
    let entry: FeedEntry;
    try {
      const headers: Record<string, string> = {};
      if (old?.etag && old.items.length) headers['if-none-match'] = old.etag;
      if (old?.modified && old.items.length) headers['if-modified-since'] = old.modified;
      const response = await fetchRss(feed.url, headers);
      const items = response.status === 304 ? old?.items ?? [] : parseFeed(response.text, feed.source).filter((item) => {
        try { return ['https:', 'http:'].includes(new URL(item.link).protocol) && item.publishedAt <= Date.now() + 300_000; }
        catch { return false; }
      });
      if (!items.length) throw new Error('Empty or invalid RSS');
      entry = { items, history: mergeHistory(old?.history ?? [], items), failures: 0,
        etag: response.etag ?? (response.status === 304 ? old?.etag : null),
        modified: response.modified ?? (response.status === 304 ? old?.modified : null),
        health: { source: feed.source, checkedAt, fetchedAt: new Date().toISOString(), status: 'ok' },
        expires: Date.now() + RSS_INTERVAL_MS };
    } catch (error) {
      unstable_rethrow(error);
      const retained = old?.health.fetchedAt && Date.now() - Date.parse(old.health.fetchedAt) < RETAIN_MS;
      const failures = (old?.failures ?? 0) + 1;
      const backoff = Math.min(3_600_000, RSS_INTERVAL_MS * 2 ** Math.min(failures - 1, 4));
      const cooldown = error instanceof UpstreamError ? retryDelay(error.retryAfter) : 0;
      entry = { items: retained ? old?.items ?? [] : [], history: mergeHistory(old?.history ?? [], []),
        failures, etag: old?.etag, modified: old?.modified,
        health: { source: feed.source, checkedAt, fetchedAt: old?.health.fetchedAt ?? null,
          status: retained ? 'stale' : 'unavailable' }, expires: Date.now() + Math.max(backoff, cooldown) };
    }
    entry.health.nextCheckAt = new Date(entry.expires).toISOString();
    entry.health.newestPublishedAt = entry.items[0]?.publishedAt
      ? new Date(Math.max(...entry.items.map((item) => item.publishedAt))).toISOString() : null;
    entries.set(feed.url, entry);
    try { await store.save(feed.url, entry); }
    catch (error) { entry.health.archiveError = true; console.error('[news-archive:write]', error); }
  })();
  pending.set(feed.url, task);
  try { await task; } finally { pending.delete(feed.url); }
}

export async function getCryptoNewsSnapshot(perFeedLimit = 15, includeArchive = false) {
  await Promise.all(FEEDS.map(refreshFeed));
  const seen = new Set<string>();
  const items: RssItem[] = [];
  const feeds: FeedHealth[] = [];
  for (const feed of FEEDS) {
    const entry = entries.get(feed.url)!;
    feeds.push(entry.health);
    const available = includeArchive ? mergeHistory(entry.history, entry.items) : entry.items;
    for (const item of [...available].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, perFeedLimit)) {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return { items: items.sort((a, b) => b.publishedAt - a.publishedAt), feeds };
}

export async function getCryptoNews(perFeedLimit = 15): Promise<RssItem[]> {
  return (await getCryptoNewsSnapshot(perFeedLimit)).items;
}

