import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OhlcvCandle } from '@/lib/features/ohlcv/types';
import type { ReplayGap } from '@/lib/features/ohlcv/replay';

/** Mirrors minute_activity.py: absence alone never establishes no trading. */
export function archiveGaps(db: DatabaseSync, directory: string, interval: string,
  candles: OhlcvCandle[], start: number, end: number, asOf: string): ReplayGap[] {
  const step = interval === '1m' ? 60_000 : 3_600_000;
  const spans: ReplayGap[] = [];
  let left = start;
  for (const c of candles) {
    if (c.ts > left) spans.push({ start: left, end: c.ts, status: 'UNKNOWN' });
    left = c.ts + step;
  }
  if (left < end) spans.push({ start: left, end, status: 'UNKNOWN' });
  if (interval !== '1m' || !spans.length) return spans;
  let hourly: DatabaseSync | undefined;
  try {
    const path = resolve(directory, 'coinbase_hourly.sqlite');
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return spans;
    hourly = new DatabaseSync(path, { readOnly: true, allowExtension: false });
    hourly.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000; BEGIN');
    const id = Object.fromEntries(hourly.prepare('SELECT key,value FROM store_identity').all().map((r) => [r.key, r.value]));
    if (id.source !== 'coinbase-exchange' || id.instrument !== 'BTC/USD' || id.granularity_seconds !== '3600') return spans;
    const states = new Map<number, boolean>();
    const reconciles = (hour: number) => {
      if (states.has(hour)) return states.get(hour)!;
      const reference = hourly!.prepare('SELECT low,high,open,close,volume FROM hourly_candles WHERE ts=? AND observed_at<=? ORDER BY observed_at DESC,payload_sha256 DESC LIMIT 1').get(hour, asOf);
      const windows = db.prepare('SELECT start_ts,end_ts FROM minute_windows WHERE start_ts<? AND end_ts>? AND fetched_at<=? ORDER BY start_ts,end_ts').all(hour + 3600, hour, asOf);
      let covered = hour;
      for (const w of windows) { if (Number(w.start_ts) > covered) break; covered = Math.max(covered, Number(w.end_ts)); }
      const rows = db.prepare(`SELECT m.ts,m.low,m.high,m.open,m.close,m.volume FROM minute_seen s
        JOIN minute_candles m ON m.ts=s.ts AND m.content_sha256=s.content_sha256
        WHERE s.ts>=? AND s.ts<? AND s.seen_at<=? AND NOT EXISTS (
          SELECT 1 FROM minute_seen n WHERE n.ts=s.ts AND n.seen_at<=?
          AND (n.seen_at>s.seen_at OR (n.seen_at=s.seen_at AND n.content_sha256>s.content_sha256))) ORDER BY s.ts`).all(hour, hour + 3600, asOf, asOf);
      let match = false;
      const valid = rows.every((r) => {
        const [low, high, open, close, volume] = [r.low, r.high, r.open, r.close, r.volume].map(Number);
        return [low, high, open, close, volume].every(Number.isFinite) && Math.min(low, high, open, close) > 0
          && volume >= 0 && low <= Math.min(open, close) && high >= Math.max(open, close);
      });
      if (reference && covered >= hour + 3600 && rows.length && valid && rows.some((r) => Number(r.volume) > 0)) {
        const aggregate = { volume: rows.reduce((n, r) => n + Number(r.volume), 0),
          low: Math.min(...rows.map((r) => Number(r.low))), high: Math.max(...rows.map((r) => Number(r.high))),
          open: Number(rows[0].open), close: Number(rows[rows.length - 1].close) };
        match = (Object.keys(aggregate) as (keyof typeof aggregate)[]).every((key) => {
          const value = Number(reference[key]);
          return Number.isFinite(value) && Math.abs(aggregate[key] - value) <= Math.max(1e-8, Math.abs(value) * (key === 'volume' ? 1e-6 : 1e-7));
        });
      }
      states.set(hour, match); return match;
    };
    const result: ReplayGap[] = [];
    for (const span of spans) {
      for (let position = span.start; position < span.end;) {
        const hour = Math.floor(position / 3_600_000) * 3600;
        const end = Math.min(span.end, (hour + 3600) * 1000);
        result.push({ start: position, end, status: reconciles(hour) ? 'INFERRED_NO_TRADE' : 'UNKNOWN' });
        position = end;
      }
    }
    return result;
  } catch {
    // Optional reconciliation evidence missing or unreadable: keep uncertainty.
    return spans;
  } finally { hourly?.close(); }
}
