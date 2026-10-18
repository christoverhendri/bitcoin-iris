import { describe, expect, it } from 'vitest';
import { ageSeconds, explainStale, fmtAgeShort, isStaleAge, live } from './envelope';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');

describe('ageSeconds', () => {
  it('measures from the payload timestamp', () => {
    expect(ageSeconds('2026-10-18T11:50:00.000Z', NOW)).toBe(600);
  });

  it('is null when the timestamp is missing or unparseable', () => {
    expect(ageSeconds(null, NOW)).toBeNull();
    expect(ageSeconds('not a date', NOW)).toBeNull();
  });

  it('clamps a timestamp from the future to zero', () => {
    expect(ageSeconds('2026-10-18T12:05:00.000Z', NOW)).toBe(0);
  });
});

describe('isStaleAge', () => {
  it('is stale once older than the limit', () => {
    expect(isStaleAge(601, 600)).toBe(true);
  });

  it('is not stale exactly at the limit', () => {
    expect(isStaleAge(600, 600)).toBe(false);
  });

  it('treats an unknown age as stale, never as live', () => {
    expect(isStaleAge(null, 600)).toBe(true);
    expect(isStaleAge(null, undefined)).toBe(true);
  });

  it('never marks a known age stale when the feature sets no limit', () => {
    expect(isStaleAge(10 * 86_400, undefined)).toBe(false);
  });
});

describe('fmtAgeShort', () => {
  it.each([
    [null, '?'],
    [30, '1m'],
    [720, '12m'],
    [32 * 3600, '32h'],
    [3 * 86_400, '3d'],
  ])('%s s -> %s', (age, want) => {
    expect(fmtAgeShort(age)).toBe(want);
  });
});

describe('explainStale', () => {
  it('is empty for fresh data and names the age for stale data', () => {
    const env = live(1, 'coinbase', '2026-10-17T04:00:00.000Z');
    expect(explainStale(env)).toBe('');
    env.isStale = true;
    env.ageSec = 32 * 3600;
    expect(explainStale(env)).toContain('32h old');
  });
});
