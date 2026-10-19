import { describe, expect, it } from 'vitest';
import { expectedHits, monthlyForward, nonOverlapping, weeklyForward, wilson, type WeeklySignalRow } from './stats';

const real = (label: 'UP' | 'DOWN' | 'NOISE', correct: boolean | null) => ({
  end_date: 'x',
  close_as_of: 100,
  close_end: 101,
  return_7d: 0.01,
  label,
  correct,
});

describe('weeklyForward', () => {
  const rows: WeeklySignalRow[] = [
    { as_of: '2026-10-15', signal: 'BULL', p_up: 0.2, realized: real('UP', true) }, // Thursday: dev run, not in the series
    { as_of: '2026-10-18', signal: 'BULL', p_up: 0.13, model_created_utc: 'm1', realized: real('UP', true) },
    { as_of: '2026-10-25', signal: 'BEAR', p_up: 0.03, model_created_utc: 'm1', realized: real('UP', false) },
    { as_of: '2026-11-01', signal: 'BULL', p_up: 0.1, model_created_utc: 'm1', realized: real('NOISE', null) },
    { as_of: '2026-11-08', signal: 'BULL', p_up: 0.1, model_created_utc: 'm2', realized: null },
  ];
  const f = weeklyForward(rows);

  it('counts only week-close (Sunday) signals, from the first one', () => {
    expect(f.start).toBe('2026-10-18');
    expect(f.published).toBe(4);
    expect(f.pending).toBe(1);
  });

  it('leaves NOISE weeks out, like the training label', () => {
    expect([f.scored, f.noise, f.labeled, f.correct]).toEqual([3, 1, 2, 1]);
    expect(f.accuracy).toBe(0.5);
    expect(f.alwaysBull).toBe(1); // both labeled weeks went UP
    expect(f.bySignal).toEqual([
      { signal: 'BULL', n: 1, correct: 1 },
      { signal: 'BEAR', n: 1, correct: 0 },
    ]);
  });

  it('reports model versions and says when there is too little to conclude', () => {
    expect(f.models).toEqual(['m1', 'm2']);
    expect(f.enough).toBe(false);
    expect(f.rows[0]).toMatchObject({ as_of: '2026-11-08', endDate: '2026-11-15' });
  });
});

describe('monthly non-overlapping series', () => {
  const weekly = Array.from({ length: 9 }, (_, i) => ({
    asOf: new Date(Date.UTC(2026, 9, 18 + 7 * i)).toISOString().slice(0, 10),
    atH: {},
  }));

  it('D+7 keeps every weekly run, D+14 every second, D+28 every fourth', () => {
    expect(nonOverlapping(weekly, 7)).toHaveLength(9);
    expect(nonOverlapping(weekly, 14).map((r) => r.asOf)).toEqual(['2026-10-18', '2026-11-01', '2026-11-15', '2026-11-29', '2026-12-13']);
    expect(nonOverlapping(weekly, 28).map((r) => r.asOf)).toEqual(['2026-10-18', '2026-11-15', '2026-12-13']);
  });

  it('a missed week shifts the series instead of overlapping windows', () => {
    const gappy = weekly.filter((_, i) => i !== 4); // no run on 2026-11-15
    expect(nonOverlapping(gappy, 28).map((r) => r.asOf)).toEqual(['2026-10-18', '2026-11-22']);
  });

  it('scores coverage per horizon with the range a correct band would give', () => {
    const o = (inside80: boolean) => ({ date: 'x', close: 1, inside80, inside90: true, bucket: 'p25-p50', abs_err_median: 0.1 });
    const runs = weekly.map((r, i) => ({ ...r, atH: i < 8 ? { '7': o(i % 4 !== 0), '28': i % 4 === 0 ? o(true) : undefined } : {} }));
    const f = monthlyForward(runs);
    const h7 = f.horizons.find((h) => h.h === 7)!;
    expect([h7.inSeries, h7.scored, h7.inside80, h7.inside90]).toEqual([9, 8, 6, 8]);
    expect(h7.expected80).toEqual(expectedHits(8, 0.8));
    expect(h7.meanAbsErr).toBeCloseTo(0.1, 12);
    const h28 = f.horizons.find((h) => h.h === 28)!;
    expect([h28.inSeries, h28.scored, h28.inside80]).toEqual([3, 2, 2]);
    expect(h28.rows[0]).toEqual({ asOf: '2026-12-13', outcome: null });
  });
});

describe('intervals', () => {
  it('Wilson 90% interval (reference: scipy, z = norm.ppf(0.95))', () => {
    const [lo, hi] = wilson(13, 26)!;
    expect(lo).toBeCloseTo(0.346498, 5);
    expect(hi).toBeCloseTo(0.653502, 5);
    expect(wilson(0, 0)).toBeNull();
  });

  it('expected hits for an 80% band (reference: scipy binom.ppf 0.05 / 0.95)', () => {
    expect(expectedHits(13, 0.8)).toEqual([8, 13]);
    expect(expectedHits(52, 0.8)).toEqual([37, 46]);
  });
});
