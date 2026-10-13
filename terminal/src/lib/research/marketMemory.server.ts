/** Server-side read-only adapter. Never imports Python or starts model fitting. */
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SCHEMA = 'iris-market-memory/v1';
const METHODS = ['HISTORICAL', 'PERSISTENCE', 'EWMA', 'HAR', 'B0', 'B1', 'B2', 'B3', 'B2_SHUFFLED'];
const HASH = /^[a-f0-9]{64}$/;
const MAX_REPORT_BYTES = 2 * 1024 * 1024;

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const integer = (v: unknown, max: number): v is number => finite(v) && Number.isInteger(v) && v >= 0 && v <= max;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

export interface MemoryScore {
  method: string;
  horizon_days: number;
  feature_count: number;
  test_origins: number;
  log_rv_mae: number;
  log_rv_pinball: number;
  qlike_mean_variance: number;
  rv_90pct_coverage: number;
  return_mae: number;
  adverse_excursion_mae: number;
}
export interface MemoryExperiment {
  horizon: number;
  eligibleOrigins: number;
  completeDays: number;
  firstOrigin: string;
  lastOrigin: string;
  scores: MemoryScore[];
}
export interface MemoryReport {
  generatedAt: string;
  sourceHours: number;
  inputHash: string;
  codeHash: string;
  lastObservedAt: string;
  experiments: MemoryExperiment[];
  warnings: string[];
}

export function parseMarketMemoryReport(value: unknown): MemoryReport {
  if (!object(value) || value.schema_version !== SCHEMA || value.status !== 'research_only' ||
      value.model_ready !== false || value.historical_backtest_safe !== false ||
      value.information_mode !== 'retrospective_reconstruction' || !date(value.generated_at) ||
      typeof value.code_sha256 !== 'string' || !HASH.test(value.code_sha256) ||
      !object(value.source) || value.source.source !== 'coinbase-exchange' ||
      value.source.instrument !== 'BTC/USD' || value.source.granularity_seconds !== 3600 ||
      !integer(value.source.source_hours, 250000) || value.source.source_hours < 1 ||
      typeof value.source.effective_sha256 !== 'string' || !HASH.test(value.source.effective_sha256) ||
      !date(value.source.last_observed_at) || !Array.isArray(value.experiments) ||
      value.experiments.length < 1 || value.experiments.length > 3 ||
      !Array.isArray(value.warnings) || value.warnings.length > 20 ||
      !value.warnings.every((s) => typeof s === 'string' && s.length <= 1000)) {
    throw new Error('Invalid research report contract');
  }
  const seen = new Set<number>();
  const experiments: MemoryExperiment[] = value.experiments.map((e: unknown) => {
    if (!object(e) || !finite(e.horizon_days) || ![1, 7, 30].includes(e.horizon_days) ||
        seen.has(e.horizon_days) || !object(e.coverage) ||
        !integer(e.coverage.eligible_origins, 11000) || e.coverage.eligible_origins < 1 ||
        !integer(e.coverage.complete_positive_days, 11000) ||
        !date(e.coverage.first_origin) || !date(e.coverage.last_origin) ||
        !Array.isArray(e.summary) || e.summary.length !== METHODS.length) {
      throw new Error('Invalid experiment summary');
    }
    seen.add(e.horizon_days);
    const methods = new Set<string>();
    const scores: MemoryScore[] = e.summary.map((s: unknown) => {
      if (!object(s) || typeof s.method !== 'string' || !METHODS.includes(s.method) ||
          methods.has(s.method) || s.horizon_days !== e.horizon_days ||
          !integer(s.feature_count, 64) || !integer(s.test_origins, 11000) || s.test_origins < 1 ||
          !['log_rv_mae', 'log_rv_pinball', 'qlike_mean_variance', 'return_mae', 'adverse_excursion_mae']
            .every((k) => nonnegative(s[k])) ||
          !finite(s.rv_90pct_coverage) || s.rv_90pct_coverage < 0 || s.rv_90pct_coverage > 1) {
        throw new Error('Invalid numerical score or duplicate candidate');
      }
      methods.add(s.method);
      return s as unknown as MemoryScore;
    });
    if (!scores.every((s) => s.test_origins === scores[0].test_origins)) {
      throw new Error('Candidates did not use common test origins');
    }
    return { horizon: e.horizon_days, eligibleOrigins: e.coverage.eligible_origins,
      completeDays: e.coverage.complete_positive_days, firstOrigin: e.coverage.first_origin,
      lastOrigin: e.coverage.last_origin, scores };
  });
  return { generatedAt: value.generated_at, sourceHours: value.source.source_hours,
    inputHash: value.source.effective_sha256, codeHash: value.code_sha256,
    lastObservedAt: value.source.last_observed_at, experiments, warnings: value.warnings as string[] };
}

export type MemoryReadResult =
  | { status: 'available'; data: MemoryReport }
  | { status: 'unavailable'; reason: 'not_configured' | 'invalid_or_unreadable' };

async function boundedRead(path: string, limit: number): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error('Invalid file');
  const bytes = await readFile(path);
  if (bytes.length > limit || bytes.length !== info.size) throw new Error('Changed or oversized file');
  return bytes;
}

export async function readMarketMemoryReport(directory = process.env.IRIS_MARKET_MEMORY_DIR): Promise<MemoryReadResult> {
  if (!directory) return { status: 'unavailable', reason: 'not_configured' };
  try {
    const manifest: unknown = JSON.parse((await boundedRead(join(directory, 'manifest.json'), 16384)).toString('utf8'));
    if (!object(manifest) || manifest.schema_version !== SCHEMA || manifest.status !== 'research_only' ||
        manifest.model_ready !== false || !object(manifest.files) ||
        !object(manifest.files['summary.json'])) throw new Error('Invalid manifest');
    const expected = manifest.files['summary.json'];
    if (typeof expected.sha256 !== 'string' || !HASH.test(expected.sha256) ||
        !integer(expected.bytes, MAX_REPORT_BYTES)) throw new Error('Invalid summary evidence');
    const raw = await boundedRead(join(directory, 'summary.json'), MAX_REPORT_BYTES);
    if (raw.length !== expected.bytes || createHash('sha256').update(raw).digest('hex') !== expected.sha256) {
      throw new Error('Summary hash mismatch');
    }
    const data = parseMarketMemoryReport(JSON.parse(raw.toString('utf8')));
    if (data.codeHash !== manifest.code_sha256) throw new Error('Code identity mismatch');
    // Only this report's checksum is verified here. Full artifact verification is Python CLI's job.
    return { status: 'available', data };
  } catch {
    // Do not leak local paths, filesystem details, or environment settings to the page.
    return { status: 'unavailable', reason: 'invalid_or_unreadable' };
  }
}
