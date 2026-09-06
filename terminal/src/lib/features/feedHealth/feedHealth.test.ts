import { describe, expect, it } from 'vitest';
import { computeLiveSources, computeSync, isStale } from './index';
import type { SourceStatusRow } from '@/lib/sourceStatus';
import type { SourceKey } from '@/lib/envelope';

const WIRED: SourceKey[] = ['coinbase', 'rss', 'derivatives'];

const row = (over: Partial<SourceStatusRow> & { source_key: SourceKey }): SourceStatusRow => ({
  display_name: 'x',
  category: 'market',
  is_enabled: true,
  requires_key: false,
  mode: 'unknown',
  last_attempt_at: null,
  last_success_at: null,
  last_error: null,
  last_row_count: null,
  consecutive_failures: 0,
  unlock_note: null,
  ...over,
});

describe('computeLiveSources', () => {
  it('falls back to the wired list when the table is empty', () => {
    // The pre-database state. This is what the footer showed before any
    // migration existed and must keep showing.
    expect([...computeLiveSources([], WIRED)].sort()).toEqual(['coinbase', 'derivatives', 'rss']);
  });

  it('does not collapse to the reporting rows once the table is seeded', () => {
    // The regression this function exists to prevent: seeding 17 catalogue rows
    // at mode 'unknown' must not drop the count to zero.
    const seeded = (['coinbase', 'rss', 'derivatives', 'fred'] as SourceKey[]).map((k) =>
      row({ source_key: k, mode: 'unknown' }),
    );
    expect(computeLiveSources(seeded, WIRED).size).toBe(3);
  });

  it('adds a source the static list does not know about', () => {
    const live = computeLiveSources([row({ source_key: 'whale_alert', mode: 'live' })], WIRED);
    expect(live.has('whale_alert')).toBe(true);
    expect(live.size).toBe(4);
  });

  it.each(['failed', 'degraded', 'mock'] as const)('removes a wired source reporting %s', (mode) => {
    const live = computeLiveSources([row({ source_key: 'rss', mode })], WIRED);
    expect(live.has('rss')).toBe(false);
    expect(live.size).toBe(2);
  });

  it('removes a disabled source whatever its mode claims', () => {
    const live = computeLiveSources(
      [row({ source_key: 'coinbase', mode: 'live', is_enabled: false })],
      WIRED,
    );
    expect(live.has('coinbase')).toBe(false);
  });

  it('treats unknown as no opinion in both directions', () => {
    const live = computeLiveSources(
      [row({ source_key: 'rss', mode: 'unknown' }), row({ source_key: 'arkham', mode: 'unknown' })],
      WIRED,
    );
    expect(live.has('rss')).toBe(true); // still wired
    expect(live.has('arkham')).toBe(false); // never was
  });
});

describe('computeSync', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');

  it('uses the current time while a direct-fetch source is counted live', () => {
    const live = computeLiveSources([], WIRED);
    const s = computeSync([], live, WIRED, now);
    expect(s.at).toBe(now.toISOString());
    expect(s.fromDirectFetch).toBe(true);
  });

  it('uses the newest reported success once every live source reports one', () => {
    const rows = [
      row({ source_key: 'coinbase', mode: 'live', last_success_at: '2026-09-03T11:00:00.000Z' }),
      row({ source_key: 'rss', mode: 'live', last_success_at: '2026-09-03T11:30:00.000Z' }),
      row({ source_key: 'derivatives', mode: 'live', last_success_at: '2026-09-03T10:00:00.000Z' }),
    ];
    const s = computeSync(rows, computeLiveSources(rows, WIRED), WIRED, now);
    expect(s.at).toBe('2026-09-03T11:30:00.000Z');
    expect(s.fromDirectFetch).toBe(false);
  });

  it('still reports direct-fetch when only some wired sources report', () => {
    // One reporting job must not make the other two look freshly measured.
    const rows = [
      row({ source_key: 'coinbase', mode: 'live', last_success_at: '2026-09-03T11:00:00.000Z' }),
    ];
    const s = computeSync(rows, computeLiveSources(rows, WIRED), WIRED, now);
    expect(s.fromDirectFetch).toBe(true);
  });

  it('returns null when nothing is live and nothing reported', () => {
    const rows = (['coinbase', 'rss', 'derivatives'] as SourceKey[]).map((k) =>
      row({ source_key: k, mode: 'failed' }),
    );
    const s = computeSync(rows, computeLiveSources(rows, WIRED), WIRED, now);
    expect(s.at).toBeNull();
    expect(s.fromDirectFetch).toBe(false);
  });
});

describe('isStale', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z');

  it('treats a missing or unparseable timestamp as stale', () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale('not a date', now)).toBe(true);
  });

  it('flips at five minutes', () => {
    expect(isStale('2026-09-03T11:56:00.000Z', now)).toBe(false);
    expect(isStale('2026-09-03T11:54:00.000Z', now)).toBe(true);
  });
});
