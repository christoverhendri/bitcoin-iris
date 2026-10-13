import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseMarketMemoryReport, readMarketMemoryReport } from './marketMemory.server';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

function fixture() {
  const methods = ['HISTORICAL', 'PERSISTENCE', 'EWMA', 'HAR', 'B0', 'B1', 'B2', 'B3', 'B2_SHUFFLED'];
  return {
    schema_version: 'iris-market-memory/v1', status: 'research_only', model_ready: false,
    historical_backtest_safe: false, information_mode: 'retrospective_reconstruction',
    generated_at: '2024-01-01T00:00:00Z', code_sha256: 'a'.repeat(64),
    source: { source: 'coinbase-exchange', instrument: 'BTC/USD', granularity_seconds: 3600,
      source_hours: 10000, effective_sha256: 'b'.repeat(64), last_observed_at: '2023-12-31T00:00:00Z' },
    warnings: ['Synthetic unit fixture, not evidence of forecast performance.'],
    experiments: [{ horizon_days: 7, coverage: { eligible_origins: 400, complete_positive_days: 430,
      first_origin: '2020-01-01T00:00:00Z', last_origin: '2021-01-01T00:00:00Z' },
      summary: methods.map((method) => ({ method, horizon_days: 7, feature_count: 30, test_origins: 100,
        log_rv_mae: .5, log_rv_pinball: .1, qlike_mean_variance: .2, rv_90pct_coverage: .8,
        return_mae: .03, adverse_excursion_mae: .04 })) }],
  };
}

describe('Market memory research adapter', () => {
  it('accepts a research-only report, not a production forecast', () => {
    const result = parseMarketMemoryReport(fixture());
    expect(result.experiments[0].scores).toHaveLength(9);
  });
  it('rejects false promotion and historical-vintage claims', () => {
    expect(() => parseMarketMemoryReport({ ...fixture(), model_ready: true })).toThrow();
    expect(() => parseMarketMemoryReport({ ...fixture(), historical_backtest_safe: true })).toThrow();
  });
  it('rejects nonfinite metrics, bad coverage and duplicate candidates', () => {
    const f = fixture();
    f.experiments[0].summary[0].log_rv_mae = NaN;
    expect(() => parseMarketMemoryReport(f)).toThrow();
    f.experiments[0].summary[0].log_rv_mae = .5;
    f.experiments[0].summary[0].rv_90pct_coverage = 1.5;
    expect(() => parseMarketMemoryReport(f)).toThrow();
    f.experiments[0].summary[0].rv_90pct_coverage = .9;
    f.experiments[0].summary[0].method = 'B2';
    expect(() => parseMarketMemoryReport(f)).toThrow();
  });
  it('rejects source mismatch and incomparable origin counts', () => {
    const f = fixture();
    f.source.source = 'kraken';
    expect(() => parseMarketMemoryReport(f)).toThrow();
    f.source.source = 'coinbase-exchange';
    f.experiments[0].summary[0].test_origins = 99;
    expect(() => parseMarketMemoryReport(f)).toThrow();
  });
  it('uses unavailable, never mock performance, without configuration', async () => {
    expect(await readMarketMemoryReport('')).toEqual({ status: 'unavailable', reason: 'not_configured' });
  });
  it('reads an exact checksum-bound report and rejects changed bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iris-memory-'));
    directories.push(dir);
    const raw = JSON.stringify(fixture());
    await writeFile(join(dir, 'summary.json'), raw);
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ schema_version: 'iris-market-memory/v1',
      status: 'research_only', model_ready: false, code_sha256: 'a'.repeat(64),
      files: { 'summary.json': { sha256: createHash('sha256').update(raw).digest('hex'), bytes: Buffer.byteLength(raw) } } }));
    expect((await readMarketMemoryReport(dir)).status).toBe('available');
    await writeFile(join(dir, 'summary.json'), raw+' ');
    expect(await readMarketMemoryReport(dir)).toEqual({ status: 'unavailable', reason: 'invalid_or_unreadable' });
  });
});
