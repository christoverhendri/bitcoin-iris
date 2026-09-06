import { describe, expect, it } from 'vitest';
import {
  alignByDate,
  correlateDaily,
  pearson,
  returns,
  stdev,
  zScore,
  type DatedPoint,
} from './correlation';

const DAY = 86_400_000;
const day = (i: number) => Date.UTC(2026, 0, 1) + i * DAY;

/** Build a dated series from closes, one per consecutive UTC day. */
const series = (closes: number[], offset = 0): DatedPoint[] =>
  closes.map((close, i) => ({ ts: day(i + offset), close }));

describe('pearson', () => {
  it('is 1 for a series against itself', () => {
    expect(pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 10);
  });

  it('is -1 against its negation', () => {
    expect(pearson([1, 2, 3, 4, 5], [-1, -2, -3, -4, -5])).toBeCloseTo(-1, 10);
  });

  it('is null when either side is flat — not zero', () => {
    // Zero would read as "measured, unrelated". Null says "not measurable".
    expect(pearson([1, 2, 3], [7, 7, 7])).toBeNull();
  });

  it('is null on a length mismatch', () => {
    expect(pearson([1, 2, 3], [1, 2])).toBeNull();
  });

  it('stays inside [-1, 1]', () => {
    const r = pearson([0.1, -0.2, 0.35, -0.05], [0.2, -0.41, 0.7, -0.11]);
    expect(r).not.toBeNull();
    expect(Math.abs(r!)).toBeLessThanOrEqual(1);
  });
});

describe('stdev / zScore', () => {
  it('measures spread', () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });

  it('returns null for a constant series', () => {
    expect(stdev([3, 3, 3])).toBeNull();
    expect(zScore([3, 3, 3])).toBeNull();
  });

  it('scores the last value against its own history', () => {
    // sum 40 over 8 -> mean 5, population sd 2, last 9 -> (9-5)/2 = 2
    expect(zScore([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });
});

describe('returns', () => {
  it('drops the first observation and skips non-positive bases', () => {
    expect(returns([100, 110, 121])).toEqual([
      expect.closeTo(0.1, 10),
      expect.closeTo(0.1, 10),
    ]);
    expect(returns([0, 10])).toEqual([]);
  });
});

describe('alignByDate', () => {
  it('keeps only the days both series contain', () => {
    // b is missing day 1 — a weekend for an equity index, a normal day for BTC.
    const a = series([10, 11, 12, 13]);
    const b: DatedPoint[] = [
      { ts: day(0), close: 100 },
      { ts: day(2), close: 102 },
      { ts: day(3), close: 103 },
    ];
    const out = alignByDate(a, b);
    expect(out.dates).toHaveLength(3);
    expect(out.a).toEqual([10, 12, 13]);
    expect(out.b).toEqual([100, 102, 103]);
  });

  it('never pairs mismatched calendar days', () => {
    // The bug this exists to prevent: index-zipping would pair a[1]=11 with
    // b[1]=102, i.e. a Tuesday close with a Thursday close.
    const a = series([10, 11, 12]);
    const b: DatedPoint[] = [
      { ts: day(0), close: 100 },
      { ts: day(2), close: 102 },
    ];
    const out = alignByDate(a, b);
    expect(out.a).toEqual([10, 12]);
    expect(out.b).toEqual([100, 102]);
  });

  it('returns empty arrays when the calendars do not overlap', () => {
    const out = alignByDate(series([1, 2, 3]), series([4, 5, 6], 100));
    expect(out.dates).toEqual([]);
  });

  it('sorts oldest first regardless of input order', () => {
    const a = [...series([10, 11, 12])].reverse();
    const b = series([100, 101, 102]);
    expect(alignByDate(a, b).a).toEqual([10, 11, 12]);
  });
});

describe('correlateDaily', () => {
  it('returns null below the window rather than a short-sample number', () => {
    const a = series(Array.from({ length: 20 }, (_, i) => 100 + i));
    const b = series(Array.from({ length: 20 }, (_, i) => 50 + i * 2));
    const out = correlateDaily(a, b, 30);
    expect(out.r).toBeNull();
    expect(out.sessions).toBeLessThan(30);
  });

  it('measures a real relationship once the window is met', () => {
    // A series must actually vary: constant compounding gives identical returns,
    // whose only variance is float noise, and correlating noise is meaningless.
    const closes = [100];
    for (let i = 1; i < 60; i += 1) {
      closes.push(closes[i - 1] * (1 + Math.sin(i) * 0.02));
    }
    // Scaling every close by a constant leaves returns identical, so r = 1.
    const out = correlateDaily(series(closes), series(closes.map((c) => c * 3)), 30);
    expect(out.r).toBeCloseTo(1, 6);
    expect(out.sessions).toBeGreaterThanOrEqual(30);
  });

  it('reads an inverse relationship as negative', () => {
    const a: number[] = [100];
    const b: number[] = [100];
    for (let i = 1; i < 60; i += 1) {
      const step = Math.sin(i) * 0.02;
      a.push(a[i - 1] * (1 + step));
      b.push(b[i - 1] * (1 - step));
    }
    const out = correlateDaily(series(a), series(b), 30);
    expect(out.r).not.toBeNull();
    expect(out.r!).toBeLessThan(-0.9);
  });
});
