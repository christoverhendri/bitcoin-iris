import type { SeasonalityCell } from './types';

interface Bar {
  /** Unix seconds. */
  ts: number;
  open: number;
  close: number;
}

/**
 * Monthly bars -> one cell per calendar month, oldest first. Bars sharing a
 * month (Yahoo's extra live bar) merge: open from the first, close from the last.
 * `current` is the running month, flagged `partial`.
 */
export function buildCells(bars: readonly Bar[], current: { year: number; month: number }): SeasonalityCell[] {
  const byMonth = new Map<string, { year: number; month: number; open: number; close: number }>();
  for (const b of [...bars].sort((a, c) => a.ts - c.ts)) {
    const d = new Date(b.ts * 1000);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const k = `${year}-${month}`;
    const prev = byMonth.get(k);
    if (prev) prev.close = b.close;
    else byMonth.set(k, { year, month, open: b.open, close: b.close });
  }
  const out: SeasonalityCell[] = [];
  for (const m of byMonth.values()) {
    if (!(m.open > 0) || !Number.isFinite(m.close)) continue;
    out.push({
      year: m.year,
      month: m.month,
      returnPct: ((m.close - m.open) / m.open) * 100,
      partial: m.year === current.year && m.month === current.month,
    });
  }
  return out.sort((a, b) => a.year - b.year || a.month - b.month);
}

/**
 * Historical bull odds per calendar month: completed years where that month
 * closed above its open, divided by all completed years of that month. Exactly
 * "jumlah bull dibagi total tahun" — no smoothing, no model.
 */
export function monthlyBullOdds(cells: readonly SeasonalityCell[]): { month: number; bull: number; total: number; pct: number | null }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const done = cells.filter((c) => c.month === m && !c.partial);
    const bull = done.filter((c) => c.returnPct > 0).length;
    return { month: m, bull, total: done.length, pct: done.length ? (bull / done.length) * 100 : null };
  });
}
