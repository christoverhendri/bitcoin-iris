import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { live, type Envelope } from '@/lib/envelope';
import type { OhlcvCandle } from '@/lib/features/ohlcv/types';
import { archiveGaps } from './archiveGaps';
import type { ReplayGap } from '@/lib/features/ohlcv/replay';

type Interval = '1m' | '1h';
interface Cursor { v: 1; interval: Interval; start: number; end: number; after: number; asOf: string }
export interface ArchiveCandle extends OhlcvCandle { observedAt: string; revisionHash: string }
export interface ArchivePage extends Envelope<ArchiveCandle[]> {
  gaps: ReplayGap[];
  nextCursor: string | null;
  archive: { venue: 'coinbase-exchange'; interval: Interval; historicalBacktestSafe: false; snapshotAt: string;
    availableStart: string | null; availableEndExclusive: string | null; availableCandles:number };
  range: { start: string; endExclusive: string; scannedEndExclusive: string };
  coverage: { expectedCandles: number; observedCandles: number; missingCandles: number };
}
export class ArchiveRequestError extends Error {}
export class ArchiveUnavailableError extends Error {}
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const observationStamp = (ms: number) => new Date(ms).toISOString().replace(/Z$/, '000Z');

function parseTime(raw: string, step: number): number {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(raw)) throw new ArchiveRequestError('Dates need an explicit timezone');
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms < 0 || ms % (step * 1000)) throw new ArchiveRequestError('Dates must align to the candle interval');
  if (new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== raw.slice(0, 10)
    || Number(raw.slice(11, 13)) > 23) throw new ArchiveRequestError('Invalid calendar date');
  return ms / 1000;
}

export function readArchivePage(params: URLSearchParams, directory = process.env.IRIS_MARKET_ARCHIVE_DIR || resolve(process.cwd(), '..', 'artifacts', 'market'), now = Date.now()): ArchivePage {
  const rawInterval = params.get('interval') ?? '1h';
  if (rawInterval !== '1m' && rawInterval !== '1h') throw new ArchiveRequestError('Archive interval must be 1m or 1h');
  const interval: Interval = rawInterval;
  const step = interval === '1m' ? 60 : 3600;
  const rawLimit = params.get('limit') ?? '500';
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 1000) throw new ArchiveRequestError('Limit must be 1..1000');
  const limit = Number(rawLimit);
  const completedCutoff = Math.floor(now / (step * 1000)) * step;
  const requestedStart = params.has('start') ? parseTime(params.get('start')!, step) : null;
  const requestedEnd = params.has('end') ? parseTime(params.get('end')!, step) : null;
  if (requestedEnd !== null && requestedEnd > completedCutoff) throw new ArchiveRequestError('End cannot include an unfinished candle');
  let cursor: Cursor | null = null;
  if (params.has('cursor')) {
    const raw = params.get('cursor')!;
    try {
      if (raw.length > 1024 || !/^[\w-]+$/.test(raw)) throw new Error();
      cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
      if (cursor.v !== 1 || cursor.interval !== interval || ![cursor.start, cursor.end, cursor.after].every((n) => Number.isSafeInteger(n) && n >= 0 && n % step === 0)
        || cursor.start > cursor.after || cursor.after >= cursor.end || cursor.end > completedCutoff
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor.asOf)
        || !Number.isFinite(Date.parse(cursor.asOf)) || Date.parse(cursor.asOf) > now
        || (requestedStart !== null && requestedStart !== cursor.start) || (requestedEnd !== null && requestedEnd !== cursor.end)) throw new Error();
    } catch { throw new ArchiveRequestError('Invalid or mismatched archive cursor'); }
  }
  const file = resolve(directory, interval === '1m' ? 'coinbase_minute.sqlite' : 'coinbase_hourly.sqlite');
  try { const info = lstatSync(file); if (!info.isFile() || info.isSymbolicLink()) throw new Error(); }
  catch { throw new ArchiveUnavailableError(`Local ${interval} archive is not available. Run the Coinbase collector first.`); }
  let db: DatabaseSync;
  try { db = new DatabaseSync(file, { readOnly: true, allowExtension: false }); }
  catch { throw new ArchiveUnavailableError('Local archive could not be opened read-only'); }
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000; BEGIN');
    const identity = Object.fromEntries(db.prepare('SELECT key,value FROM store_identity').all().map((r) => [r.key, r.value]));
    if (identity.source !== 'coinbase-exchange' || identity.instrument !== 'BTC/USD' || identity.granularity_seconds !== String(step)) throw new ArchiveUnavailableError('Local archive has an incompatible source or interval');
    const table = interval === '1m' ? 'minute_candles' : 'hourly_candles';
    // Both lookups use the ts prefix of the primary key, even for multi-year archives.
    const asOf = cursor?.asOf ?? observationStamp(now);
    const observedTable=interval==='1m'?'minute_seen s JOIN minute_candles m ON m.ts=s.ts AND m.content_sha256=s.content_sha256':`${table} h`;
    const keyColumn=interval==='1m'?'s.ts':'h.ts';
    const observedColumn=interval==='1m'?'s.seen_at':'h.observed_at';
    const bounds=db.prepare(`SELECT MIN(${keyColumn}) AS first,MAX(${keyColumn}) AS last,COUNT(DISTINCT ${keyColumn}) AS total FROM ${observedTable} WHERE ${keyColumn}<? AND ${observedColumn}<=?`).get(completedCutoff,asOf)!;
    const start = cursor?.start ?? requestedStart ?? (bounds.first === null ? completedCutoff : Number(bounds.first));
    const end = cursor?.end ?? requestedEnd ?? (bounds.last === null ? completedCutoff : Math.min(completedCutoff, Number(bounds.last) + step));
    if (start > end || (start === end && requestedStart !== null)) throw new ArchiveRequestError('Start must precede end');
    const left = cursor ? cursor.after + step : start;
    // Bound work even when a large requested range is empty or mostly gaps.
    const queryEnd = Math.min(end, left + 10_000 * step);
    const query = interval === '1m'
      ? `SELECT m.ts,m.low,m.high,m.open,m.close,m.volume,s.content_sha256 AS hash,s.seen_at AS observed
         FROM minute_seen s JOIN minute_candles m ON m.ts=s.ts AND m.content_sha256=s.content_sha256
         WHERE s.ts>=? AND s.ts<? AND s.seen_at<=? AND NOT EXISTS (
           SELECT 1 FROM minute_seen newer WHERE newer.ts=s.ts AND newer.seen_at<=?
             AND (newer.seen_at>s.seen_at OR (newer.seen_at=s.seen_at AND newer.content_sha256>s.content_sha256)))
         ORDER BY s.ts LIMIT ?`
      : `SELECT h.ts,h.low,h.high,h.open,h.close,h.volume,h.payload_sha256 AS hash,h.observed_at AS observed
         FROM hourly_candles h WHERE h.ts>=? AND h.ts<? AND h.observed_at<=? AND NOT EXISTS (
           SELECT 1 FROM hourly_candles newer WHERE newer.ts=h.ts AND newer.observed_at<=?
             AND (newer.observed_at>h.observed_at OR (newer.observed_at=h.observed_at AND newer.payload_sha256>h.payload_sha256)))
         ORDER BY h.ts LIMIT ?`;
    const rows = db.prepare(query).all(left, queryEnd, asOf, asOf, limit + 1);
    const hasExtraRow = rows.length > limit;
    const hasMore = hasExtraRow || queryEnd < end;
    const selected = rows.slice(0, limit);
    const data: ArchiveCandle[] = selected.map((r) => {
      const ts = Number(r.ts), low = Number(r.low), high = Number(r.high), open = Number(r.open), close = Number(r.close), volume = Number(r.volume);
      if (!Number.isSafeInteger(ts) || ts < 0 || ts % step || ![low,high,open,close,volume].every(Number.isFinite)
        || Math.min(low,high,open,close) <= 0 || volume < 0 || low > Math.min(open,close) || high < Math.max(open,close)
        || typeof r.hash !== 'string' || !/^[a-f\d]{64}$/.test(r.hash) || typeof r.observed !== 'string' || !Number.isFinite(Date.parse(r.observed))) {
        throw new ArchiveUnavailableError('Local archive contains invalid candle data');
      }
      return { symbol: 'BTC-USD', interval, ts: ts * 1000, low, high, open, close, volume, revisionHash: r.hash, observedAt: r.observed };
    });
    const scannedEnd = hasExtraRow ? data[data.length - 1].ts / 1000 + step : queryEnd;
    const after = scannedEnd - step;
    const expected = Math.max(0, (scannedEnd - left) / step);
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({ v: 1, interval, start, end, after, asOf } satisfies Cursor)).toString('base64url') : null;
    const gaps = archiveGaps(db, directory, interval, data, left * 1000, scannedEnd * 1000, asOf);
    db.exec('COMMIT');
    return { ...live(data, 'coinbase', asOf), nextCursor, gaps,
      archive: { venue: 'coinbase-exchange', interval, historicalBacktestSafe: false, snapshotAt: asOf,
        availableStart: bounds.first === null ? null : iso(Number(bounds.first)), availableEndExclusive: bounds.last === null ? null : iso(Number(bounds.last) + step),availableCandles:Number(bounds.total) },
      range: { start: iso(start), endExclusive: iso(end), scannedEndExclusive: iso(scannedEnd) },
      coverage: { expectedCandles: expected, observedCandles: data.length, missingCandles: expected - data.length } };
  } catch (error) {
    if (error instanceof ArchiveRequestError || error instanceof ArchiveUnavailableError) throw error;
    throw new ArchiveUnavailableError('Local archive schema or query is unavailable');
  } finally { db.close(); }
}
