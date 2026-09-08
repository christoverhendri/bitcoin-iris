import { afterEach, expect, it, vi } from 'vitest';
import { parseWatcherSnapshot } from './watcherGuru';
import fixture from './fixtures/semantic-news.json';
import { semanticCategory } from './semanticNews';
afterEach(() => vi.useRealTimers());
it('deduplicates posts, keeps latest edits and rejects unsafe IDs, invalid dates and old history', () => {
  const post = { source_id: '123', raw_text: 'Bitcoin rally', published_at: new Date().toISOString() };
  const result = parseWatcherSnapshot({ version: 1, records: [post, { ...post, raw_text: 'Bitcoin crash' },
    { ...post, source_id: '../evil' }, { ...post, source_id: '456', published_at: 'invalid' },
    { ...post, source_id: '789', published_at: '2000-01-01T00:00:00Z' }] });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ title: 'Bitcoin crash', source: 'Watcher.Guru', link: 'https://t.me/WatcherGuru/123' });
});

it('reads actual Python output with unicode evidence and shared ranking weights', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
  const result = parseWatcherSnapshot(fixture);
  expect(result.items).toHaveLength(7);
  const denied = result.items.find(item => item.link.endsWith('/1'))!;
  expect(denied.semantic?.parse.events[0]).toMatchObject({ polarity: 'negated', trigger: { text: 'approved' } });
  expect(denied.semantic?.parse.needs_review).toBe(true);
  expect(denied.semantic?.weighting.post_weight).toBe(0.5);
  expect(semanticCategory(denied.semantic!)).toBe('REGULATION');
  const hack = result.items.find(item => item.link.endsWith('/6'))!;
  expect(semanticCategory(hack.semantic!)).toBe('SECURITY');
  expect(hack.semantic?.parse.events[0].polarity).toBe('negated');
});

it('rejects invalid v2 evidence or weights instead of falling back to headline sentiment', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
  for (const mutate of [
    (record: typeof fixture.records[number]) => { record.semantic_parse.events[0].trigger.start += 1; },
    (record: typeof fixture.records[number]) => { record.weighting.post_weight = 2; },
    (record: typeof fixture.records[number]) => { record.semantic_parse.parser_version = 'unsupported'; },
  ]) {
    const record = structuredClone(fixture.records[0]);
    mutate(record);
    expect(parseWatcherSnapshot({ version: 2, records: [record] }).items).toEqual([]);
  }
});
