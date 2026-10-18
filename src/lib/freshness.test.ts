import { afterEach, describe, expect, it } from 'vitest';
import { FRESHNESS_WINDOW_MS, recordFreshness, resetFreshness, staleSources } from './freshness';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');

afterEach(() => resetFreshness());

describe('staleSources', () => {
  it('lists a source whose last reading was stale', () => {
    recordFreshness('derivatives', 'derivatives', true, NOW);
    expect([...staleSources(NOW)]).toEqual(['derivatives']);
  });

  it('clears a source once the same feature reads fresh again', () => {
    recordFreshness('derivatives', 'derivatives', true, NOW);
    recordFreshness('derivatives', 'derivatives', false, NOW + 1000);
    expect(staleSources(NOW + 1000).size).toBe(0);
  });

  it('keeps a shared source stale while any of its features is stale', () => {
    recordFreshness('rss', 'news', false, NOW);
    recordFreshness('rss', 'sentiment', true, NOW);
    expect(staleSources(NOW).has('rss')).toBe(true);
  });

  it('forgets readings older than the window', () => {
    recordFreshness('coinbase', 'snapshot', true, NOW);
    expect(staleSources(NOW + FRESHNESS_WINDOW_MS + 1).size).toBe(0);
  });
});
