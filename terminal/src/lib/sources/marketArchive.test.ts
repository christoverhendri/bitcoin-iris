import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readArchivePage } from './marketArchive';

let directory: string;
const start = Date.parse('2015-07-21T00:00:00Z') / 1000;
const now = Date.parse('2026-10-12T12:00:00Z');
const observed = '2026-10-12T10:00:00.000000Z';
const hash = (n: number) => n.toString(16).padStart(64, '0');

function fixture(interval: '1h' | '1m') {
  const db = new DatabaseSync(join(directory, interval === '1h' ? 'coinbase_hourly.sqlite' : 'coinbase_minute.sqlite'));
  db.exec(`CREATE TABLE store_identity(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO store_identity VALUES ('source','coinbase-exchange'),('instrument','BTC/USD'),('granularity_seconds','${interval === '1h' ? 3600 : 60}');`);
  if (interval === '1h') {
    db.exec('CREATE TABLE hourly_candles(ts INTEGER,payload_sha256 TEXT,observed_at TEXT,last_seen_at TEXT,low REAL,high REAL,open REAL,close REAL,volume REAL,PRIMARY KEY(ts,payload_sha256))');
    for (const i of [0, 1, 3]) db.prepare('INSERT INTO hourly_candles VALUES (?,?,?,?,?,?,?,?,?)').run(start + i * 3600, hash(i + 1), observed, observed, 100, 110, 101, 109, 2);
  } else {
    db.exec(`CREATE TABLE minute_candles(ts INTEGER,content_sha256 TEXT,low REAL,high REAL,open REAL,close REAL,volume REAL,PRIMARY KEY(ts,content_sha256));
      CREATE TABLE minute_seen(ts INTEGER,content_sha256 TEXT,seen_at TEXT,PRIMARY KEY(ts,content_sha256,seen_at));
      CREATE INDEX minute_seen_time ON minute_seen(ts,seen_at DESC);`);
    for (const i of [0, 1, 3]) {
      db.prepare('INSERT INTO minute_candles VALUES (?,?,?,?,?,?,?)').run(start + i * 60, hash(i + 1), 100, 110, 101, 109, 2);
      db.prepare('INSERT INTO minute_seen VALUES (?,?,?)').run(start + i * 60, hash(i + 1), observed);
    }
  }
  db.close();
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'iris-archive-')); });
afterEach(() => {
  if (!directory.startsWith(join(tmpdir(), 'iris-archive-'))) throw new Error('Unexpected fixture directory');
  rmSync(directory, { recursive: true, force: true });
});

describe('canonical SQLite market archive', () => {
  it('infers absent minutes only with full fetch coverage and independent hourly reconciliation', () => {
    fixture('1m'); fixture('1h');
    const minutes = new DatabaseSync(join(directory, 'coinbase_minute.sqlite'));
    minutes.exec('CREATE TABLE minute_windows(start_ts INTEGER,end_ts INTEGER,fetched_at TEXT)');
    minutes.prepare('INSERT INTO minute_windows VALUES (?,?,?)').run(start, start + 3600, observed);
    minutes.close();
    const hours = new DatabaseSync(join(directory, 'coinbase_hourly.sqlite'));
    hours.prepare('UPDATE hourly_candles SET volume=6 WHERE ts=?').run(start); hours.close();
    const params = new URLSearchParams({ interval: '1m', end: '2015-07-21T01:00:00Z' });
    const page = readArchivePage(params, directory, now);
    expect(page.gaps).toEqual([
      { start: (start + 120) * 1000, end: (start + 180) * 1000, status: 'INFERRED_NO_TRADE' },
      { start: (start + 240) * 1000, end: (start + 3600) * 1000, status: 'INFERRED_NO_TRADE' },
    ]);
    expect(page.data).toHaveLength(3);
    const changed = new DatabaseSync(join(directory, 'coinbase_hourly.sqlite'));
    changed.prepare('UPDATE hourly_candles SET volume=7 WHERE ts=?').run(start); changed.close();
    expect(readArchivePage(params, directory, now).gaps.every((g) => g.status === 'UNKNOWN')).toBe(true);
    const restored = new DatabaseSync(join(directory, 'coinbase_hourly.sqlite'));
    restored.prepare('UPDATE hourly_candles SET volume=6 WHERE ts=?').run(start); restored.close();
    const futureCoverage = new DatabaseSync(join(directory, 'coinbase_minute.sqlite'));
    futureCoverage.prepare('UPDATE minute_windows SET end_ts=?').run(start + 1800);
    expect(readArchivePage(params, directory, now).gaps.every((g) => g.status === 'UNKNOWN')).toBe(true);
    futureCoverage.prepare('UPDATE minute_windows SET end_ts=?').run(start + 3600);
    futureCoverage.exec("UPDATE minute_windows SET fetched_at='2026-10-13T00:00:00.000000Z'"); futureCoverage.close();
    expect(readArchivePage(params, directory, now).gaps.every((g) => g.status === 'UNKNOWN')).toBe(true);
  });
  for (const interval of ['1h', '1m'] as const) {
    it(`paginates ${interval} without duplicates or filling gaps, and never writes the database`, () => {
      fixture(interval);
      const path = join(directory, interval === '1h' ? 'coinbase_hourly.sqlite' : 'coinbase_minute.sqlite');
      const before = readFileSync(path);
      const first = readArchivePage(new URLSearchParams({ interval, limit: '2' }), directory, now);
      expect(first.data).toHaveLength(2);
      expect(first.sourceKey).toBe('coinbase');
      expect(first.isMock).toBe(false);
      expect(first.data[0].ts).toBe(start * 1000);
      expect(first.data[0].observedAt).toBe(observed);
      const next = readArchivePage(new URLSearchParams({ interval, cursor: first.nextCursor!, limit: '2' }), directory, now);
      expect(next.data).toHaveLength(1);
      expect(next.data[0].ts).toBe((start + 3 * (interval === '1h' ? 3600 : 60)) * 1000);
      expect(next.coverage).toEqual({ expectedCandles: 2, observedCandles: 1, missingCandles: 1 });
      const step = interval === '1h' ? 3600 : 60;
      expect(next.gaps).toEqual([{ start: (start + 2 * step) * 1000, end: (start + 3 * step) * 1000, status: 'UNKNOWN' }]);
      expect(next.nextCursor).toBeNull();
      expect(readFileSync(path)).toEqual(before);
    });
  }

  it('freezes revision visibility across pages when newer source corrections arrive', () => {
    fixture('1h');
    const first = readArchivePage(new URLSearchParams({ interval: '1h', limit: '1' }), directory, now);
    const db = new DatabaseSync(join(directory, 'coinbase_hourly.sqlite'));
    db.prepare('INSERT INTO hourly_candles VALUES (?,?,?,?,?,?,?,?,?)').run(start + 3600, hash(99), '2026-10-12T13:00:00.000000Z', '2026-10-12T13:00:00.000000Z', 100, 120, 101, 119, 3);
    db.close();
    const second = readArchivePage(new URLSearchParams({ interval: '1h', limit: '1', cursor: first.nextCursor! }), directory, now + 7200000);
    expect(second.data[0].close).toBe(109);
    expect(second.archive.snapshotAt).toBe(first.archive.snapshotAt);
  });

  it('selects the most recent minute observation, including a reversion', () => {
    fixture('1m');
    const db = new DatabaseSync(join(directory, 'coinbase_minute.sqlite'));
    db.prepare('INSERT INTO minute_candles VALUES (?,?,?,?,?,?,?)').run(start, hash(99), 100, 120, 101, 119, 2);
    db.prepare('INSERT INTO minute_seen VALUES (?,?,?)').run(start, hash(99), '2026-10-12T11:00:00.000000Z');
    db.prepare('INSERT INTO minute_seen VALUES (?,?,?)').run(start, hash(1), '2026-10-12T11:30:00.000000Z');
    db.close();
    expect(readArchivePage(new URLSearchParams({ interval: '1m' }), directory, now).data[0].close).toBe(109);
  });

  it('reports leading and trailing gaps for an explicit range', () => {
    fixture('1h');
    const result = readArchivePage(new URLSearchParams({ interval: '1h', start: '2015-07-20T23:00:00Z', end: '2015-07-21T05:00:00Z' }), directory, now);
    expect(result.coverage).toEqual({ expectedCandles: 6, observedCandles: 3, missingCandles: 3 });
  });

  it('bounds sparse scans and advances the cursor through empty pages', () => {
    fixture('1m');
    const first = readArchivePage(new URLSearchParams({ interval: '1m', end: '2015-08-21T00:00:00Z' }), directory, now);
    expect(first.coverage.expectedCandles).toBe(10_000);
    expect(first.data).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = readArchivePage(new URLSearchParams({ interval: '1m', cursor: first.nextCursor! }), directory, now);
    expect(second.data).toEqual([]);
    expect(second.coverage).toEqual({ expectedCandles: 10_000, observedCandles: 0, missingCandles: 10_000 });
    expect(second.nextCursor).not.toBe(first.nextCursor);
  });

  it('rejects unavailable archives without creating a database', () => {
    expect(() => readArchivePage(new URLSearchParams(), directory, now)).toThrow('not available');
  });

  it('rejects unsupported intervals, excessive limits, unaligned dates and bad cursors', () => {
    fixture('1h');
    const invalid: Record<string, string>[] = [{ interval: '1d' }, { limit: '1001' }, { limit: '-1' }, { start: '2015-07-21' }, { start: '2015-02-31T00:00:00Z' }, { start: '2015-07-21T00:01:00Z' }, { cursor: 'garbage' }, { end: '2099-01-01T00:00:00Z' }];
    for (const params of invalid) {
      expect(() => readArchivePage(new URLSearchParams(params), directory, now)).toThrow();
    }
    const first = readArchivePage(new URLSearchParams({ limit: '1' }), directory, now);
    expect(() => readArchivePage(new URLSearchParams({ interval: '1m', cursor: first.nextCursor! }), directory, now)).toThrow('mismatched');
  });

  it('rejects an incompatible venue and corrupt OHLC instead of serving it', () => {
    fixture('1h');
    let db = new DatabaseSync(join(directory, 'coinbase_hourly.sqlite'));
    db.exec("UPDATE store_identity SET value='kraken' WHERE key='source'"); db.close();
    expect(() => readArchivePage(new URLSearchParams(), directory, now)).toThrow('incompatible');
    db = new DatabaseSync(join(directory, 'coinbase_hourly.sqlite'));
    db.exec("UPDATE store_identity SET value='coinbase-exchange' WHERE key='source'; UPDATE hourly_candles SET low=200"); db.close();
    expect(() => readArchivePage(new URLSearchParams(), directory, now)).toThrow('invalid candle');
  });
});
