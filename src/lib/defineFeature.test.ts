import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sourceStatus', () => ({ getSourceStatus: vi.fn(async () => null) }));
vi.mock('@/lib/sources', () => ({ unlockNoteFor: () => null }));

import { defineFeature } from './defineFeature';
import { resetFreshness, staleSources } from './freshness';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function feature(asOf: string | null, maxAgeSec?: number) {
  return defineFeature<void, number>({
    key: 'test_feature',
    source: 'coinbase',
    live: async () => ({ data: 42, asOf, synthetic: false }),
    mock: () => 0,
    maxAgeSec,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetFreshness();
});

describe('defineFeature staleness', () => {
  it('keeps real data but marks it stale when older than maxAgeSec', async () => {
    const env = await feature(minsAgo(11), 600)();
    expect(env.isMock).toBe(false);
    expect(env.data).toBe(42);
    expect(env.isStale).toBe(true);
    expect(env.ageSec).toBe(660);
    expect(staleSources(NOW).has('coinbase')).toBe(true);
  });

  it('is not stale exactly at the limit', async () => {
    const env = await feature(minsAgo(10), 600)();
    expect(env.isStale).toBe(false);
    expect(staleSources(NOW).size).toBe(0);
  });

  it('never counts a payload with no timestamp as live', async () => {
    const env = await feature(null, 600)();
    expect(env.isMock).toBe(false);
    expect(env.isStale).toBe(true);
    expect(env.ageSec).toBeNull();
  });

  it('has no age limit when maxAgeSec is omitted', async () => {
    const env = await feature(minsAgo(60 * 24 * 30))();
    expect(env.isStale).toBe(false);
  });

  it('accepts a per-args limit', async () => {
    const f = defineFeature<{ tight: boolean }, number>({
      key: 'test_args',
      source: 'coinbase',
      live: async () => ({ data: 1, asOf: minsAgo(30), synthetic: false }),
      mock: () => 0,
      maxAgeSec: (a) => (a.tight ? 600 : 3600),
    });
    expect((await f({ tight: true })).isStale).toBe(true);
    expect((await f({ tight: false })).isStale).toBe(false);
  });

  it('records a failed fetch as stale for the feed count', async () => {
    const f = defineFeature<void, number>({
      key: 'test_fail',
      source: 'derivatives',
      live: async () => {
        throw new Error('blocked');
      },
      mock: () => 0,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await f();
    expect(env.isMock).toBe(true);
    expect(staleSources(NOW).has('derivatives')).toBe(true);
  });
});
