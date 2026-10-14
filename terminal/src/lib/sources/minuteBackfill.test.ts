import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMinuteBackfill } from './minuteBackfill';
import { GET } from '@/app/api/market/backfill/route';

const directories: string[] = [];
const now = Date.parse('2026-01-05T12:00:00Z');
const start = Date.parse('2026-01-01T00:00:00Z') / 1000;
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'iris-minute-progress-'));
  directories.push(dir);
  mkdirSync(join(dir, 'minute-fullhistory'));
  const progress = {
    state: 'running', pid: 123, monthly_batches: 1, planned_monthly_requests: 24,
    completed_batches: ['historical-probe'], active_batch: '2026-01', last_error: null,
    updated_at: new Date(now - 1000).toISOString(),
    config: { start: '2026-01-01T00:00:00Z', end_exclusive: '2026-01-05T00:00:00Z', page_minutes: 240 },
  };
  const save = () => writeFileSync(join(dir, 'minute-fullhistory', 'progress.json'), JSON.stringify(progress));
  save();
  const db = new DatabaseSync(join(dir, 'coinbase_minute.sqlite'));
  db.exec(`CREATE TABLE store_identity(key TEXT,value TEXT);
    INSERT INTO store_identity VALUES ('source','coinbase-exchange'),('instrument','BTC/USD'),('granularity_seconds','60');
    CREATE TABLE minute_candles(ts INTEGER,version TEXT);
    CREATE TABLE minute_windows(start_ts INTEGER,end_ts INTEGER,fetched_at TEXT);`);
  db.prepare('INSERT INTO minute_candles VALUES (?,?)').run(start, 'v1');
  db.prepare('INSERT INTO minute_candles VALUES (?,?)').run(start, 'v2');
  db.prepare('INSERT INTO minute_candles VALUES (?,?)').run(start + 60, 'v1');
  for (let i = 0; i < 10; i++) db.prepare('INSERT INTO minute_windows VALUES (?,?,?)')
    .run(start + i * 14400, start + (i + 1) * 14400, new Date(now - 30000 + i * 2000).toISOString());
  db.prepare('INSERT INTO minute_windows VALUES (?,?,?)').run(start, start + 14400, new Date(now - 60000).toISOString());
  db.close();
  return { dir, progress, save };
}
afterEach(() => { vi.unstubAllEnvs(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('minute backfill operational status', () => {
  it('counts distinct minutes and successful plan windows once, with a measured ETA', () => {
    const { dir } = fixture();
    const result = readMinuteBackfill(dir, now, () => true);
    expect(result.collectedMinutes).toBe(2);
    expect(result.completedWindows).toBe(10);
    expect(result.percent).toBeCloseTo(100 * 10 / 24);
    expect(result.requestsPerMinute).toBe(30);
    expect(result.remainingSeconds).toBe(28);
    expect(result).not.toHaveProperty('pid');
    expect(result).not.toHaveProperty('database');
  });
  it('removes ETA when the collector process has exited or progress is stale', () => {
    const { dir } = fixture();
    expect(readMinuteBackfill(dir, now, () => false)).toMatchObject({ state: 'stopped', remainingSeconds: null });
    expect(readMinuteBackfill(dir, now + 600000, () => true)).toMatchObject({ state: 'stalled', remainingSeconds: null });
  });
  it('rejects an incomplete completion claim and inconsistent request budget', () => {
    const { dir, progress, save } = fixture();
    progress.state = 'complete'; save();
    expect(() => readMinuteBackfill(dir, now)).toThrow('Incomplete completion claim');
    progress.state = 'running'; progress.planned_monthly_requests = 5; save();
    expect(() => readMinuteBackfill(dir, now)).toThrow('Invalid backfill range');
  });
  it('does not expose the operational endpoint in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await GET();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});
