import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { parseWatcherSnapshot } = await import('./watcherGuru');

const NOW = Date.parse('2026-10-18T16:30:00Z');

function snapshot(over: Record<string, unknown> = {}) {
  return {
    version: 2,
    origin: 'durable_store',
    fetched_at: '2026-10-18T16:29:14Z',
    records: [
      { source_id: '15549', raw_text: 'JUST IN: older\n\n@WatcherGuru', display_text: 'Older post', published_at: '2026-10-18T12:49:00Z' },
      { source_id: '15550', raw_text: 'JUST IN: Newer  post\n\n@WatcherGuru', display_text: 'Newer  post', published_at: '2026-10-18T15:43:26Z' },
      { source_id: '0bad', raw_text: 'x', display_text: 'x', published_at: '2026-10-18T15:00:00Z' },
      { source_id: '15551', raw_text: 'no date', display_text: 'no date', published_at: 'soon' },
    ],
    ...over,
  };
}

describe('parseWatcherSnapshot', () => {
  it('maps records to newest-first headlines linking to the Telegram post', () => {
    const { items, fetchedAt } = parseWatcherSnapshot(snapshot(), NOW);
    expect(fetchedAt).toBe(Date.parse('2026-10-18T16:29:14Z'));
    expect(items.map((i) => i.title)).toEqual(['Newer post', 'Older post']);
    expect(items[0]).toMatchObject({ source: 'Watcher Guru', link: 'https://t.me/WatcherGuru/15550' });
  });

  it('rejects snapshots not built from the durable store', () => {
    expect(() => parseWatcherSnapshot(snapshot({ origin: 'fixture' }), NOW)).toThrow();
    expect(() => parseWatcherSnapshot(snapshot({ version: 1 }), NOW)).toThrow();
  });

  it('has no fetch time when fetched_at is missing or in the future', () => {
    expect(parseWatcherSnapshot(snapshot({ fetched_at: undefined }), NOW).fetchedAt).toBeNull();
    expect(parseWatcherSnapshot(snapshot({ fetched_at: '2026-10-19T00:00:00Z' }), NOW).fetchedAt).toBeNull();
  });
});
