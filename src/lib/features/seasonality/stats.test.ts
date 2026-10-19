import { describe, expect, it } from 'vitest';
import { toDay, type DailySeries } from '@/lib/quant/daily';
import { buildMonthlyCells, monthlySummary } from './stats';

/** Daily closes from `startIso`, one per day. */
const series = (startIso: string, prices: number[]): DailySeries => ({ start: toDay(startIso), prices });

describe('buildMonthlyCells', () => {
  it('is close-to-close: last close of the month over the previous month-end', () => {
    // 30 Sep = 100, then October climbs to 110 on the 31st.
    const s = series('2026-09-30', [100, ...Array.from({ length: 31 }, (_, i) => 100 + ((i + 1) * 10) / 31)]);
    const cells = buildMonthlyCells(s);
    expect(cells).toHaveLength(1); // September has no previous month-end inside the data
    expect(cells[0]).toMatchObject({ year: 2026, month: 10, partial: true });
    expect(cells[0].returnPct).toBeCloseTo(10, 9);
  });

  it('a new month starts by itself: data to 31 Oct vs 1 Nov', () => {
    const toOct31 = series('2025-09-30', Array.from({ length: 397 }, (_, i) => 100 + i)); // 2025-09-30 … 2026-10-31
    const toNov1 = series('2025-09-30', Array.from({ length: 398 }, (_, i) => 100 + i));
    const a = buildMonthlyCells(toOct31);
    const b = buildMonthlyCells(toNov1);
    const last = (c: typeof a) => c[c.length - 1];
    expect(last(a)).toMatchObject({ year: 2026, month: 10, partial: true });
    expect(last(b)).toMatchObject({ year: 2026, month: 11, partial: true });
    expect(b.find((c) => c.year === 2026 && c.month === 10)!.partial).toBe(false);
    // October's summary gains a year once the month is final.
    expect(monthlySummary(a)[9].n).toBe(1);
    expect(monthlySummary(b)[9].n).toBe(2);
  });
});

describe('monthlySummary', () => {
  it('mean, median, share of up years and n — running month left out', () => {
    const cells = [
      { year: 2023, month: 1, returnPct: 5 },
      { year: 2024, month: 1, returnPct: -3 },
      { year: 2025, month: 1, returnPct: 1 },
      { year: 2026, month: 1, returnPct: 9, partial: true },
    ];
    const jan = monthlySummary(cells)[0];
    expect(jan).toMatchObject({ month: 1, n: 3, up: 2, median: 1 });
    expect(jan.mean).toBeCloseTo(1, 12);
    expect(jan.pctUp).toBeCloseTo((2 / 3) * 100, 12);
    expect(monthlySummary(cells)[1]).toMatchObject({ n: 0, mean: null, median: null, pctUp: null });
  });
});
