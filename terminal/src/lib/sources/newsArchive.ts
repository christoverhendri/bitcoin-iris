import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { RssItem } from './rss';

export const ARCHIVE_DAYS = 30;
export function mergeHistory(previous: RssItem[], incoming: RssItem[], now = Date.now()) {
  const entries = new Map<string, RssItem>();
  for (const item of [...previous, ...incoming]) {
    if (!item.publishedAt || item.publishedAt < now - ARCHIVE_DAYS * 86_400_000 || item.publishedAt > now + 300_000) continue;
    let url: URL;
    try { url = new URL(item.link); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
    entries.set(url.href, item);
  }
  return [...entries.values()].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 2000);
}

/** Local single-server store. Each feed checkpoint and archive commit atomically. */
export function createArchiveStore(directory = process.env.IRIS_NEWS_ARCHIVE_DIR || resolve(process.cwd(), '.data/news')) {
  const file = (url: string) => join(directory, createHash('sha256').update(url).digest('hex') + '.json');
  return {
    async load<T>(url: string): Promise<T | undefined> {
      try {
        const document = JSON.parse(await readFile(file(url), 'utf8'));
        if (document.version !== 1 || document.url !== url) throw new Error('Invalid archive version');
        return document.value as T;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    async save<T>(url: string, value: T) {
      await mkdir(directory, { recursive: true });
      const destination = file(url);
      const temporary = destination + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify({ version: 1, url, value }), 'utf8');
      await rename(temporary, destination);
    },
  };
}
