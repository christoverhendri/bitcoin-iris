import { afterEach, expect, it, vi } from 'vitest';
import { parseWatcherSnapshot, getWatcherGuruSnapshot } from './watcherGuru';
import fixture from './fixtures/semantic-news.json';
import { semanticCategory } from './semanticNews';
vi.mock('node:fs/promises', () => ({ stat: vi.fn(), readFile: vi.fn() }));
import { stat, readFile } from 'node:fs/promises';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
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


it('does not turn a failed fetch or a new export into source freshness', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
  const result = parseWatcherSnapshot({ ...fixture, generated_at: '2026-09-08T00:00:00Z',
    fetched_at: '2026-09-07T12:00:00Z', attempted_at: '2026-09-08T00:00:00Z',
    source_health: { status: 'failed' } });
  expect(result.asOf).toBe('2026-09-07T12:00:00Z');
  expect(result.health.status).toBe('stale');
  expect(parseWatcherSnapshot(fixture).asOf).toBeUndefined();
  const recentFailure = parseWatcherSnapshot({ ...fixture, fetched_at: '2026-09-07T23:59:00Z',
    source_health: { status: 'failed' } });
  expect(recentFailure.health.status).toBe('stale');
});


it('rejects noncanonical runtime snapshots and reports missing files unavailable', async () => {
  vi.mocked(stat).mockResolvedValue({ size: 100 } as Awaited<ReturnType<typeof stat>>);
  vi.mocked(readFile).mockResolvedValue(JSON.stringify(fixture));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await getWatcherGuruSnapshot()).health.status).toBe('unavailable');
  vi.mocked(stat).mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  expect((await getWatcherGuruSnapshot()).asOf).toBeUndefined();
});

it('serves canonical runtime projections with observed success health', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
  vi.mocked(stat).mockResolvedValue({ size: 100 } as Awaited<ReturnType<typeof stat>>);
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({ ...fixture, origin: 'durable_store',
    fetched_at: '2026-09-07T23:59:00Z', source_health: { status: 'ok' } }));
  const result = await getWatcherGuruSnapshot();
  expect(result.items).toHaveLength(7);
  expect(result.health.status).toBe('ok');
});
