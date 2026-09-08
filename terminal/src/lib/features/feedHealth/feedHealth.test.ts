import { describe, expect, it } from 'vitest';
import { computeObservedSources, computeSync, isStale } from './index';
import type { SourceStatusRow } from '@/lib/sourceStatus';
import type { SourceKey } from '@/lib/envelope';

const row = (over: Partial<SourceStatusRow> & { source_key: SourceKey }): SourceStatusRow => ({
  display_name: 'x', category: 'market', is_enabled: true, requires_key: false,
  mode: 'unknown', last_attempt_at: null, last_success_at: null, last_error: null,
  last_row_count: null, consecutive_failures: 0, unlock_note: null, ...over,
});

describe('observed source health', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z');
  it('does not infer health from wiring or catalogue rows', () => {
    expect(computeObservedSources([]).size).toBe(0);
    expect(computeObservedSources([row({ source_key: 'rss', mode: 'unknown' })], now).size).toBe(0);
  });
  it('counts only enabled sources with live mode and a success observation', () => {
    const observed = computeObservedSources([
      row({ source_key: 'rss', mode: 'live', last_success_at: '2026-09-03T11:59:00.000Z' }),
      row({ source_key: 'coinbase', mode: 'live' }),
      row({ source_key: 'derivatives', mode: 'live', last_success_at: '2026-09-03T11:00:00.000Z', is_enabled: false }),
    ], now);
    expect([...observed]).toEqual(['rss']);
  });
  it('rejects failed, stale, and future success timestamps', () => {
    expect(computeObservedSources([
      row({ source_key: 'rss', mode: 'failed', last_success_at: '2026-09-03T11:59:00.000Z' }),
      row({ source_key: 'coinbase', mode: 'live', last_success_at: '2026-09-03T11:00:00.000Z' }),
      row({ source_key: 'derivatives', mode: 'live', last_success_at: '2026-09-03T12:01:00.000Z' }),
    ], now).size).toBe(0);
  });
});

describe('computeSync', () => {
  it('ignores failed and disabled successes and compares instants across ISO formats', () => {
    const now = Date.parse('2026-09-03T12:00:00Z');
    expect(computeSync([
      row({ source_key: 'rss', mode: 'live', last_success_at: '2026-09-03T11:59:00Z' }),
      row({ source_key: 'coinbase', mode: 'failed', last_success_at: '2026-09-03T12:00:00Z' }),
      row({ source_key: 'derivatives', mode: 'live', is_enabled: false, last_success_at: '2026-09-03T12:00:00Z' }),
    ], now).at).toBe('2026-09-03T11:59:00Z');
  });
  it('returns only the newest reported success and never the current clock', () => {
    const now = Date.parse('2026-09-03T12:00:00.000Z');
    expect(computeSync([], now).at).toBeNull();
    expect(computeSync([
      row({ source_key: 'rss', mode: 'live', last_success_at: '2026-09-03T11:30:00.000Z' }),
      row({ source_key: 'coinbase', mode: 'live', last_success_at: '2026-09-03T11:00:00.000Z' }),
    ], now).at).toBe('2026-09-03T11:30:00.000Z');
  });
});

describe('isStale', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z');
  it('treats missing or unparseable timestamps as stale', () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale('not a date', now)).toBe(true);
    expect(isStale('2026-09-04T00:00:00Z', now)).toBe(true);
  });
  it('flips at five minutes', () => {
    expect(isStale('2026-09-03T11:56:00.000Z', now)).toBe(false);
    expect(isStale('2026-09-03T11:54:00.000Z', now)).toBe(true);
  });
});
