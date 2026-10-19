/**
 * A gap-free daily close series, indexed by UTC day number (days since
 * 1970-01-01). Pure helpers shared by `cycle.ts` and `powerLaw.ts`.
 */

const DAY_MS = 86_400_000;

/** `2026-10-18` -> UTC day number. */
export function toDay(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** UTC day number (may be fractional) -> `2026-10-18`, flooring like pandas `.date()`. */
export function isoDay(day: number): string {
  return new Date(Math.floor(day) * DAY_MS).toISOString().slice(0, 10);
}

/** `day` shifted by whole calendar months, clamped to the month's last day (pandas `DateOffset(months=n)`). */
export function addMonths(day: number, months: number): number {
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) / DAY_MS);
}

/** Last day of every month whose month-end falls in [from, to] (pandas `date_range(freq="ME")`). */
export function monthEnds(from: number, to: number): number[] {
  const out: number[] = [];
  const d = new Date(from * DAY_MS);
  for (let y = d.getUTCFullYear(), m = d.getUTCMonth(); ; m += 1) {
    const end = Math.floor(Date.UTC(y, m + 1, 0) / DAY_MS);
    if (end > to) break;
    if (end >= from) out.push(end);
  }
  return out;
}

/** First day of every month in [from, to] (pandas `date_range(freq="MS")`). */
export function monthStarts(from: number, to: number): number[] {
  const out: number[] = [];
  const d = new Date(from * DAY_MS);
  for (let y = d.getUTCFullYear(), m = d.getUTCMonth(); ; m += 1) {
    const start = Math.floor(Date.UTC(y, m, 1) / DAY_MS);
    if (start > to) break;
    if (start >= from) out.push(start);
  }
  return out;
}

export interface DailySeries {
  /** Day number of `prices[0]`; `prices[i]` is the close of day `start + i`. */
  start: number;
  prices: number[];
}

export const lastDay = (s: DailySeries) => s.start + s.prices.length - 1;

/**
 * Raw (date, price) rows -> gap-free daily series, exactly as the notebook does:
 * drop prices ≤ 0, sort by date, keep the last row of a duplicated date,
 * reindex to every calendar day and forward-fill the gaps.
 */
export function prepareDaily(rows: readonly { date: string; price: number }[]): DailySeries {
  const byDay = new Map<number, number>();
  rows
    .filter((r) => Number.isFinite(r.price) && r.price > 0)
    .map((r) => ({ day: toDay(r.date), price: r.price }))
    .sort((a, b) => a.day - b.day)
    .forEach((r) => byDay.set(r.day, r.price));
  const days = [...byDay.keys()];
  if (days.length === 0) return { start: 0, prices: [] };
  const start = days[0];
  const end = days[days.length - 1];
  const prices: number[] = [];
  let prev = byDay.get(start)!;
  for (let d = start; d <= end; d += 1) {
    prev = byDay.get(d) ?? prev;
    prices.push(prev);
  }
  return { start, prices };
}
