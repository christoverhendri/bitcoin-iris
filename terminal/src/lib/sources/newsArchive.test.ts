import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createArchiveStore, mergeHistory } from './newsArchive';
const now = Date.now();
const item = { title: 'Story', source: 'Test', link: 'https://example.com/a', description: '', publishedAt: now };
it('keeps stories removed from the latest feed and expires old history', () => {
  const old = { ...item, link: 'https://example.com/old', publishedAt: now - 31 * 86400000 };
  expect(mergeHistory([item, old], [], now)).toEqual([item]);
  expect(mergeHistory([item], [{ ...item, link: item.link + '?utm_source=rss' }], now)).toHaveLength(1);
});
it('restores article history and cooldown checkpoint with a new store instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'iris-archive-test-'));
  try {
    const value = { history: [item], expires: now + 1800000, etag: 'v1' };
    await createArchiveStore(dir).save('https://example.com/feed', value);
    expect(await createArchiveStore(dir).load('https://example.com/feed')).toEqual(value);
    await createArchiveStore(dir).save('https://example.com/feed', { ...value, etag: 'v2' });
    expect(await createArchiveStore(dir).load('https://example.com/feed')).toEqual({ ...value, etag: 'v2' });
  } finally {
    for (const name of await readdir(dir)) await unlink(join(dir, name));
    await rmdir(dir);
  }
});
