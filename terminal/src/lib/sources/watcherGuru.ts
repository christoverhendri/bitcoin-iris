import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RssItem, FeedHealth } from './rss';
import { mergeHistory } from './newsArchive';
import { readSemanticNews } from './semanticNews';

export function parseWatcherSnapshot(document: unknown): { items: RssItem[]; asOf?: string; health: FeedHealth } {
  if (!document || typeof document !== 'object') throw new Error('Invalid Watcher.Guru snapshot');
  const snapshot = document as Record<string, unknown>;
  if ((snapshot.version !== 1 && snapshot.version !== 2) || !Array.isArray(snapshot.records)) throw new Error('Invalid Watcher.Guru version');
  const items: RssItem[] = [];
  for (const record of snapshot.records.slice(0, 2000)) {
    if (!record || typeof record !== 'object') continue;
    const { source_id: id, raw_text: text, published_at: published } = record;
    if (typeof id !== 'string' || !/^[1-9][0-9]{0,17}$/.test(id) || typeof text !== 'string' || !text.trim() || [...text].length > 16000 || typeof published !== 'string') continue;
    const semantic = snapshot.version === 2 ? readSemanticNews(text, record.semantic_parse, record.weighting) : undefined;
    // A malformed v2 assessment must not silently become a keyword prediction.
    if (snapshot.version === 2 && !semantic) continue;
    items.push({ title: text, description: text, source: 'Watcher.Guru', semantic,
      link: `https://t.me/WatcherGuru/${id}`, publishedAt: Date.parse(published) });
  }
  // Export time is never evidence of a successful upstream fetch.
  const asOf = typeof snapshot.fetched_at === 'string' && Number.isFinite(Date.parse(snapshot.fetched_at))
    && Date.parse(snapshot.fetched_at) <= Date.now() ? snapshot.fetched_at : undefined;
  const sourceHealth = snapshot.source_health as Record<string, unknown> | undefined;
  const fresh = !!asOf && Date.now() - Date.parse(asOf) <= 300_000;
  const kept = mergeHistory([], items);
  const health: FeedHealth = {
    source: 'Watcher.Guru',
    checkedAt: typeof snapshot.attempted_at === 'string' ? snapshot.attempted_at : '',
    fetchedAt: asOf ?? null,
    status: fresh && sourceHealth?.status === 'ok' ? 'ok' : kept.length ? 'stale' : 'unavailable',
    newestPublishedAt: kept[0] ? new Date(kept[0].publishedAt).toISOString() : null,
    nextCheckAt: typeof sourceHealth?.next_retry_at === 'string' ? sourceHealth.next_retry_at : undefined,
  };
  return { items: kept, asOf, health };
}

export async function getWatcherGuruSnapshot() {
  const path = process.env.IRIS_WATCHER_SNAPSHOT || resolve(process.cwd(), '.data/watcher-guru.json');
  try {
    // Runtime snapshot is provisioned separately, never bundled into a deployment.
    if ((await stat(/* turbopackIgnore: true */ path)).size > 40 * 1024 * 1024) throw new Error('Watcher.Guru snapshot exceeds 40 MiB');
    const document = JSON.parse(await readFile(/* turbopackIgnore: true */ path, 'utf8'));
    if (document.version !== 2 || document.origin !== 'durable_store') throw new Error('Rebuild Watcher snapshot from the canonical database');
    return parseWatcherSnapshot(document);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[watcher-guru]', error);
    return { items: [] as RssItem[], asOf: undefined, health: { source: 'Watcher.Guru',
      checkedAt: '', fetchedAt: null, status: 'unavailable' as const } };
  }
}
