import { DatabaseSync } from 'node:sqlite';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MinuteBackfillProgress } from '@/lib/minuteBackfill';

function regularFile(file: string, limit: number) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('Invalid collector artifact');
}

const integer = (v: unknown, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || value.length > 40 || !/(Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error('Invalid collector timestamp');
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new Error('Invalid collector timestamp');
  return n;
}

/** Local, read-only operational status. No collector control or historical price mutation. */
export function readMinuteBackfill(
  directory = process.env.IRIS_MARKET_ARCHIVE_DIR || resolve(process.cwd(), '..', 'artifacts', 'market'),
  now = Date.now(),
  isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } },
): MinuteBackfillProgress {
  const progressFile = resolve(directory, 'minute-fullhistory', 'progress.json');
  regularFile(progressFile, 128 * 1024);
  const progress = JSON.parse(readFileSync(progressFile, 'utf8'));
  if (!['running', 'stopped', 'failed', 'complete'].includes(progress.state)
      || !integer(progress.pid, 2 ** 31 - 1) || progress.pid === 0
      || !integer(progress.monthly_batches, 1000) || progress.monthly_batches === 0
      || !Array.isArray(progress.completed_batches) || progress.completed_batches.length > 1002
      || !progress.completed_batches.every((x: unknown) => typeof x === 'string' && /^(\d{4}-\d{2}|historical-probe|recent-probe)$/.test(x))) {
    throw new Error('Invalid collector progress');
  }
  const start = timestamp(progress.config?.start) / 1000;
  const end = timestamp(progress.config?.end_exclusive) / 1000;
  const updated = timestamp(progress.updated_at);
  const pageMinutes = progress.config?.page_minutes;
  if (start < 0 || end <= start || end * 1000 > now || start % 60 || end % 60
      || !integer(pageMinutes, 299) || !pageMinutes || !integer(progress.planned_monthly_requests, 100000)
      || progress.planned_monthly_requests !== Math.ceil((end - start) / (pageMinutes * 60))
      || updated > now + 10000) throw new Error('Invalid backfill range');
  const totalWindows = progress.planned_monthly_requests;
  const file = resolve(directory, 'coinbase_minute.sqlite');
  regularFile(file, 8 * 1024 ** 3);
  const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000; BEGIN');
    const identity = Object.fromEntries(db.prepare('SELECT key,value FROM store_identity').all().map(r => [r.key, r.value]));
    if (identity.source !== 'coinbase-exchange' || identity.instrument !== 'BTC/USD' || identity.granularity_seconds !== '60') throw new Error('Incompatible archive');
    const collectedMinutes = Number(db.prepare('SELECT COUNT(DISTINCT ts) AS n FROM minute_candles WHERE ts>=? AND ts<?').get(start, end)!.n);
    // Count successfully checkpointed plan windows once, including repeated observations.
    const completedWindows = Number(db.prepare(`SELECT COUNT(*) AS n FROM (
      SELECT start_ts,end_ts FROM minute_windows
      WHERE start_ts>=? AND end_ts<=? AND (start_ts-?) % ? = 0
        AND end_ts=MIN(start_ts+?,?) GROUP BY start_ts,end_ts
    )`).get(start, end, start, pageMinutes * 60, pageMinutes * 60, end)!.n);
    const fetches = db.prepare(`SELECT MAX(fetched_at) AS fetched_at FROM minute_windows
      WHERE start_ts>=? AND end_ts<=? GROUP BY start_ts,end_ts ORDER BY fetched_at DESC LIMIT 201`).all(start, end);
    const times = fetches.map(r => timestamp(r.fetched_at));
    const latest = times[0] ?? null;
    const elapsed = times.length > 1 ? (times[0] - times[times.length - 1]) / 1000 : 0;
    const rate = elapsed > 0 ? (times.length - 1) / elapsed : null;
    let state: MinuteBackfillProgress['state'] = progress.state;
    if (state === 'running') {
      if (!isAlive(progress.pid)) state = 'stopped';
      else if (now - Math.max(updated, latest ?? 0) > 120000) state = 'stalled';
    }
    if (state === 'complete' && completedWindows !== totalWindows) throw new Error('Incomplete completion claim');
    const usableRate = state === 'running' && latest !== null && now - latest < 120000 && times.length >= 10 ? rate : null;
    return {
      state, collectedMinutes, completedWindows, totalWindows,
      percent: Math.min(100, 100 * completedWindows / totalWindows),
      completedMonths: new Set<string>(progress.completed_batches.filter((x: string) => /^\d{4}-\d{2}$/.test(x))).size,
      totalMonths: progress.monthly_batches,
      activeBatch: typeof progress.active_batch === 'string' && /^(\d{4}-\d{2}|historical-probe|recent-probe)$/.test(progress.active_batch) ? progress.active_batch : null,
      requestedStart: new Date(start * 1000).toISOString(), requestedEnd: new Date(end * 1000).toISOString(),
      lastFetch: latest === null ? null : new Date(latest).toISOString(), capturedAt: new Date(now).toISOString(),
      requestsPerMinute: usableRate === null ? null : usableRate * 60,
      remainingSeconds: state === 'complete' ? 0 : usableRate === null ? null : (totalWindows - completedWindows) / usableRate,
      hasCollectorError: Boolean(progress.last_error),
    };
  } finally { db.close(); }
}
