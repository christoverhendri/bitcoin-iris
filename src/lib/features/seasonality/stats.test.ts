import { describe, expect, it } from 'vitest';
import { buildCells, monthlyBullOdds } from './stats';

const sec = (iso: string) => Date.parse(iso) / 1000;

describe('buildCells', () => {
  it('uses open -> close per month and merges Yahoo\'s extra live bar', () => {
    const cells = buildCells(
      [
        { ts: sec('2026-09-01T00:00:00Z'), open: 100, close: 110 },
        { ts: sec('2026-10-01T00:00:00Z'), open: 110, close: 99 },
        { ts: sec('2026-10-18T08:56:00Z'), open: 109, close: 121 }, // live bar, same month
      ],
      { year: 2026, month: 10 },
    );
    expect(cells).toHaveLength(2);
    expect(cells[0].returnPct).toBeCloseTo(10);
    expect(cells[0].partial).toBe(false);
    // October: open from the first bar (110), close from the live bar (121).
    expect(cells[1].returnPct).toBeCloseTo(10);
    expect(cells[1].partial).toBe(true);
  });
});

describe('monthlyBullOdds', () => {
  it('is bull years / completed years, leaving the running month out', () => {
    const cells = [
      { year: 2023, month: 1, returnPct: 5 },
      { year: 2024, month: 1, returnPct: -3 },
      { year: 2025, month: 1, returnPct: 1 },
      { year: 2026, month: 1, returnPct: 9, partial: true },
    ];
    const jan = monthlyBullOdds(cells)[0];
    expect(jan).toEqual({ month: 1, bull: 2, total: 3, pct: (2 / 3) * 100 });
    expect(monthlyBullOdds(cells)[1].pct).toBeNull();
  });
});
