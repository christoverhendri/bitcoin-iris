import type { OhlcvCandle } from './types';
import type { SupportResistanceLevels } from '../levels/types';
import { pivotPoints, vwap } from '@/lib/quant/series';

export const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000,
  '4h': 14_400_000, '6h': 21_600_000, '1d': 86_400_000, '1w': 604_800_000,
};

export interface ReplayGap { start: number; end: number; status: 'UNKNOWN' | 'INFERRED_NO_TRADE' }
export type ReplayEntry = { start: number; end: number; candle: OhlcvCandle; gap?: never }
  | { start: number; end: number; candle?: never; gap: ReplayGap };

/** Compressed missing spans retain time without allocating years of empty bars. */
export function replayTimeline(candles: OhlcvCandle[], gaps: ReplayGap[] = []): ReplayEntry[] {
  const missing = gaps.length ? gaps : candles.slice(1).flatMap((c, i) => {
    const start = candles[i].ts + INTERVAL_MS[c.interval];
    return c.ts > start ? [{ start, end: c.ts, status: 'UNKNOWN' as const }] : [];
  });
  return [...candles.map((c) => ({ start: c.ts, end: c.ts + INTERVAL_MS[c.interval], candle: c })),
    ...missing.map((gap) => ({ start: gap.start, end: gap.end, gap }))].sort((a, b) => a.start - b.start);
}

export function replayEntrySnapshot(entries: ReplayEntry[], cursor: number) {
  const index = Math.max(0, Math.min(entries.length - 1, Math.floor(cursor) || 0));
  const entry = entries[index];
  const visible = entries.slice(0, index + 1);
  const candles = visible.flatMap((e) => e.candle ? [e.candle] : []);
  const snapshot = replaySnapshot(candles, candles.length - 1);
  return { ...snapshot, levels: entry?.gap ? null : snapshot.levels, entry,
    gaps: visible.flatMap((e) => e.gap ? [e.gap] : []) };
}

/** 1× means one native interval per second, including missing intervals. */
export function replayDelay(entry: ReplayEntry, interval: string, speed: number) {
  return (entry.end - entry.start) / INTERVAL_MS[interval] * 1000 / speed;
}
/** Date seek snaps backwards to a completed step, never to a future candle. */
export function seekReplayIndex(entries:ReplayEntry[],cutoff:number):number {
  return Number.isFinite(cutoff)?entries.findLastIndex(e=>e.end<=cutoff):-1;
}

export function completedReplayCandles(candles: OhlcvCandle[], cutoff: number): OhlcvCandle[] {
  return candles.filter((c) => INTERVAL_MS[c.interval] !== undefined && c.ts + INTERVAL_MS[c.interval] <= cutoff);
}

/** Each replay step reveals a completed bar; nothing beyond the cursor is read. */
export function replaySnapshot(candles: OhlcvCandle[], cursor: number): {
  candles: OhlcvCandle[];
  levels: SupportResistanceLevels | null;
} {
  if (!candles.length) return { candles: [], levels: null };
  const index = Math.max(0, Math.min(candles.length - 1, Number.isFinite(cursor) ? Math.floor(cursor) : 0));
  const visible = candles.slice(0, index + 1);
  const last = visible[visible.length - 1];
  const pivots = pivotPoints(last.high, last.low, last.close);
  // Fixed trailing window so future dataset length cannot affect past levels.
  return { candles: visible, levels: {
    r2: pivots.r2, r1: pivots.r1, s1: pivots.s1, s2: pivots.s2,
    vwap: vwap(visible.slice(-100)),
  } };
}
