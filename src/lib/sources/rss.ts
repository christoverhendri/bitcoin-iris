/**
 * RSS ingestion. Keyless, and the shared parser behind every headline in the
 * terminal — the news wire, the sentiment tally and the global events map.
 *
 * No XML dependency: feed item structure is regular enough that a scoped regex
 * is more robust here than pulling in a parser that also has to handle Atom,
 * namespaces and malformed HTML. Both `<item>` (RSS 2.0) and `<entry>` (Atom)
 * are recognised, because several institutional feeds publish Atom.
 *
 * Failures are counted, not swallowed. A feed that dies quietly is worse than
 * one that errors: `reutersagency.com` 404'd for an unknown stretch while the
 * events map carried on looking healthy, because `Promise.allSettled` hid it.
 * `fetchFeeds` reports which sources answered so a caller can say so.
 */
import { fetchText } from './http';

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

export interface FeedBatch {
  items: RssItem[];
  /** Feeds that returned at least one item. */
  ok: number;
  total: number;
  /** Source names that failed or returned nothing. */
  failed: string[];
}

/**
 * Crypto feeds, each verified keyless, un-blocked from a datacentre IP, and
 * returning parseable items.
 *
 * Deliberately excluded after testing: CryptoSlate (403 to server IPs) and the
 * high-volume aggregators U.Today and CoinGape — they publish enough
 * near-duplicate items to skew the sentiment tally toward whichever story they
 * are repeating, and the tally weights every headline equally.
 */
export const FEEDS: FeedDef[] = [
  { source: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' },
  { source: 'NewsBTC', url: 'https://www.newsbtc.com/feed/' },
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { source: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { source: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed' },
  { source: 'Blockworks', url: 'https://blockworks.co/feed' },
  { source: 'BeInCrypto', url: 'https://beincrypto.com/feed/' },
];
// Watcher.Guru is not an RSS feed here: its Telegram posts come from the news
// pipeline snapshot (`./watcherGuru.ts`), merged in `@/lib/sentiment/news`.

export function unwrap(s: string): string {
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

/** Atom puts the URL in `<link href="...">` rather than in the element body. */
function atomLink(block: string): string | null {
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}

/** Parse one feed document. Exported for tests. */
export function parseFeed(xml: string, source: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = [
    ...(xml.match(/<item[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []),
  ];

  for (const block of blocks) {
    const rawTitle = tag(block, 'title');
    if (!rawTitle) continue;

    const rawLink = tag(block, 'link');
    const rawDate =
      tag(block, 'pubDate') ??
      tag(block, 'dc:date') ??
      tag(block, 'published') ??
      tag(block, 'updated');
    const rawDesc =
      tag(block, 'description') ??
      tag(block, 'content:encoded') ??
      tag(block, 'summary') ??
      tag(block, 'content');

    const parsed = rawDate ? Date.parse(unwrap(rawDate)) : NaN;
    const desc = rawDesc ? unwrap(rawDesc).replace(/\s+/g, ' ').trim() : '';
    const linkText = rawLink ? unwrap(rawLink) : '';

    items.push({
      title: unwrap(rawTitle),
      link: linkText || atomLink(block) || '',
      publishedAt: Number.isFinite(parsed) ? parsed : 0,
      source,
      description: desc.length > 320 ? `${desc.slice(0, 317)}...` : desc,
    });
  }

  return items;
}

/**
 * Fetch a set of feeds in parallel, merge, drop duplicate headlines, newest
 * first. One slow or dead feed costs its own items, not the batch — but it is
 * counted in `failed` rather than vanishing.
 */
export async function fetchFeeds(
  defs: FeedDef[],
  perFeedLimit = 15,
  revalidate = 600,
): Promise<FeedBatch> {
  const settled = await Promise.allSettled(
    defs.map(async (f) => {
      const xml = await fetchText(f.url, { revalidate });
      return { source: f.source, items: parseFeed(xml, f.source).slice(0, perFeedLimit) };
    }),
  );

  const seen = new Set<string>();
  const merged: RssItem[] = [];
  const failed: string[] = [];
  let ok = 0;

  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled' || r.value.items.length === 0) {
      failed.push(defs[i].source);
      return;
    }
    ok += 1;
    for (const item of r.value.items) {
      const k = item.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(item);
    }
  });

  if (failed.length > 0) {
    // Visible in server logs. A silently dead feed is how Reuters rotted here.
    console.warn(`[rss] ${failed.length}/${defs.length} feeds returned nothing:`, failed.join(', '));
  }

  merged.sort((a, b) => b.publishedAt - a.publishedAt);
  return { items: merged, ok, total: defs.length, failed };
}

/** Crypto headlines only. The shape every existing caller expects. */
export async function getCryptoNews(perFeedLimit = 15): Promise<RssItem[]> {
  return (await fetchFeeds(FEEDS, perFeedLimit)).items;
}

/** Crypto headlines plus which feeds answered, for callers that report health. */
export async function getCryptoNewsBatch(perFeedLimit = 15): Promise<FeedBatch> {
  return fetchFeeds(FEEDS, perFeedLimit);
}
