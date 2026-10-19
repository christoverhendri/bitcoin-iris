import { isoDay, lastDay, type DailySeries } from '@/lib/quant/daily';
import type { SeasonalityCell } from './types';

/**
 * Daily closes -> one cell per calendar month (UTC), oldest first:
 * `return m = last close of m ÷ last close of the month before − 1`, so the
 * first day's move counts. The month holding the newest close is the running
 * month (`partial`, month-to-date); it becomes final by itself the day a close
 * from the next month arrives. A month needs the previous month's last close,
 * so the first month of data has no cell.
 */
export function buildMonthlyCells(s: DailySeries): SeasonalityCell[] {
  if (s.prices.length === 0) return [];
  const lastClose = new Map<string, { year: number; month: number; close: number }>();
  for (let i = 0; i < s.prices.length; i += 1) {
    const iso = isoDay(s.start + i);
    const year = Number(iso.slice(0, 4));
    const month = Number(iso.slice(5, 7));
    lastClose.set(`${year}-${month}`, { year, month, close: s.prices[i] });
  }
  const end = isoDay(lastDay(s));
  const running = { year: Number(end.slice(0, 4)), month: Number(end.slice(5, 7)) };
  const out: SeasonalityCell[] = [];
  for (const m of lastClose.values()) {
    const prevYear = m.month === 1 ? m.year - 1 : m.year;
    const prevMonth = m.month === 1 ? 12 : m.month - 1;
    const prev = lastClose.get(`${prevYear}-${prevMonth}`);
    // The first month of data has no previous month-end close.
    if (!prev) continue;
    out.push({
      year: m.year,
      month: m.month,
      returnPct: (m.close / prev.close - 1) * 100,
      partial: m.year === running.year && m.month === running.month,
    });
  }
  return out.sort((a, b) => a.year - b.year || a.month - b.month);
}

export interface MonthSummary {
  month: number;
  /** Completed years only (the running month is left out). */
  n: number;
  up: number;
  mean: number | null;
  median: number | null;
  /** Share of completed years that month closed higher, 0–100. */
  pctUp: number | null;
}

/** Per calendar month: mean, median, share of up years and n — completed years only. */
export function monthlySummary(cells: readonly SeasonalityCell[]): MonthSummary[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const v = cells.filter((c) => c.month === m && !c.partial).map((c) => c.returnPct).sort((a, b) => a - b);
    const n = v.length;
    const up = v.filter((x) => x > 0).length;
    return {
      month: m,
      n,
      up,
      mean: n ? v.reduce((a, b) => a + b, 0) / n : null,
      median: n ? (n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2) : null,
      pctUp: n ? (up / n) * 100 : null,
    };
  });
}
