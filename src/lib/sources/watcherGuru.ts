/**
 * Watcher.Guru headlines from the researcher's news pipeline.
 *
 * Watcher.Guru has no public API. The pipeline (`news_pipeline/`, copied from
 * christoverhendri/bitcoin-iris branch azan-sentiment) reads the public
 * Telegram preview t.me/s/WatcherGuru into a SQLite store and exports a JSON
 * snapshot; the worker job `watcher_news` refreshes it every minute. This file
 * only reads that snapshot — it never scrapes Telegram itself.
 *
 * Adapted from bitcoin-iris `terminal/src/lib/sources/watcherGuru.ts`, minus
 * its news archive and semantic-news scoring (not ported): headlines here are
 * labelled by the same sentiment model as every other headline.
 *
 * Live or nothing: a snapshot that is missing, not built from the durable
 * store, or whose last successful Telegram fetch is older than
 * `MAX_FETCH_AGE_MS` contributes no items (the worker is probably stopped).
 */
import 'server-only';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RssItem } from './rss';

export const WATCHER_SOURCE = 'Watcher Guru';

/** Worker runs every minute; ten minutes allows for the pipeline's fetch back-off. */
export const MAX_FETCH_AGE_MS = 10 * 60_000;

const MAX_BYTES = 40 * 1024 * 1024;

/** Pure parser, exported for tests. Throws on a document that is not a v2 durable-store snapshot. */
export function parseWatcherSnapshot(document: unknown, now = Date.now()): { items: RssItem[]; fetchedAt: number | null } {
  if (!document || typeof document !== 'object') throw new Error('invalid snapshot');
  const snap = document as Record<string, unknown>;
  if (snap.version !== 2 || snap.origin !== 'durable_store' || !Array.isArray(snap.records)) {
    throw new Error('not a v2 durable_store snapshot');
  }

  // Export time is not evidence of a successful fetch; fetched_at is.
  const fetched = typeof snap.fetched_at === 'string' ? Date.parse(snap.fetched_at) : NaN;
  const fetchedAt = Number.isFinite(fetched) && fetched <= now ? fetched : null;

  const items: RssItem[] = [];
  for (const record of snap.records.slice(0, 2000)) {
    if (!record || typeof record !== 'object') continue;
    const r = record as Record<string, unknown>;
    const id = r.source_id;
    const text = typeof r.display_text === 'string' && r.display_text.trim() ? r.display_text : r.raw_text;
    const published = typeof r.published_at === 'string' ? Date.parse(r.published_at) : NaN;
    if (typeof id !== 'string' || !/^[1-9][0-9]{0,17}$/.test(id)) continue;
    if (typeof text !== 'string' || !text.trim() || text.length > 16000) continue;
    if (!Number.isFinite(published)) continue;
    const title = text.replace(/\s+/g, ' ').trim();
    items.push({
      title,
      link: `https://t.me/WatcherGuru/${id}`,
      publishedAt: published,
      source: WATCHER_SOURCE,
      description: '',
    });
  }
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  return { items, fetchedAt };
}

/** Newest-first Watcher.Guru posts, or [] when the snapshot is missing, invalid or stale. */
export async function getWatcherGuruNews(): Promise<RssItem[]> {
  const path = process.env.IRIS_WATCHER_SNAPSHOT || resolve(process.cwd(), '.data/watcher-guru.json');
  try {
    if ((await stat(/* turbopackIgnore: true */ path)).size > MAX_BYTES) throw new Error('snapshot exceeds 40 MiB');
    const { items, fetchedAt } = parseWatcherSnapshot(
      JSON.parse(await readFile(/* turbopackIgnore: true */ path, 'utf8')),
    );
    if (fetchedAt === null || Date.now() - fetchedAt > MAX_FETCH_AGE_MS) {
      console.warn('[watcher-guru] snapshot is stale (worker job watcher_news not running?); skipped');
      return [];
    }
    return items;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[watcher-guru]', error);
    return [];
  }
}
