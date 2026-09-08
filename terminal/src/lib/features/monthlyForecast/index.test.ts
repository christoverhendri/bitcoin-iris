import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthlyForecast } from './index';
import { getSourceStatus } from '@/lib/sourceStatus';

vi.mock('@/lib/sourceStatus', () => ({ getSourceStatus: vi.fn().mockResolvedValue(null) }));

const previous = process.env.IRIS_FORECAST_PATH;
beforeEach(() => {
  vi.mocked(getSourceStatus).mockResolvedValue(null);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  if (previous === undefined) delete process.env.IRIS_FORECAST_PATH;
  else process.env.IRIS_FORECAST_PATH = previous;
});

describe('configured monthly forecast', () => {
  it('respects a disabled source and unsupported instrument', async () => {
    process.env.IRIS_FORECAST_PATH = 'not-read.json';
    const unsupported = await getMonthlyForecast({ symbol: 'ETH' });
    expect(unsupported.unlockNote).toContain('BTC/USD only');
    vi.mocked(getSourceStatus).mockResolvedValue({ is_enabled: false } as Awaited<ReturnType<typeof getSourceStatus>>);
    const disabled = await getMonthlyForecast({ symbol: 'BTC' });
    expect(disabled.unavailable).toBe(true);
    expect(disabled.unlockNote).toContain('disabled');
  });
  it('fails closed when the configured artifact is missing', async () => {
    process.env.IRIS_FORECAST_PATH = join(tmpdir(), 'iris-forecast-does-not-exist.json');
    const result = await getMonthlyForecast({ symbol: 'BTC-USD' });
    expect(result.unavailable).toBe(true);
    expect(result.data.p50).toBeNull();
    expect(result.isMock).toBe(false);
  });

  it('maps a valid artifact to endpoint-only data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iris-forecast-'));
    const path = join(dir, 'forecast.json');
    const origin = '2026-09-08T00:00:00.000Z';
    await writeFile(path, JSON.stringify({
      schema_version: 1, instrument: 'BTC/USD', venue: 'research', origin,
      target_end: '2026-10-08T00:00:00.000Z', horizon_days: 30,
      as_of: '2026-09-08T00:00:00.000Z', generated_at: '2026-09-08T01:00:00.000Z',
      feature_cutoff: '2026-09-07T23:00:00.000Z', training_cutoff: '2026-09-07T00:00:00.000Z',
      data_sha256: 'b'.repeat(64), model_version: 'ridge-v1', reference_price: 100,
      return_quantiles: { p10: -0.1, p50: 0, p90: 0.2 },
      price_quantiles: { p10: 100 * Math.exp(-0.1), p50: 100, p90: 100 * Math.exp(0.2) },
      calibration: { status: 'validated' }, method: 'Ridge quantile baseline',
    }));
    process.env.IRIS_FORECAST_PATH = path;
    const result = await getMonthlyForecast({ symbol: 'BTC-USD' });
    expect(result.unavailable).not.toBe(true);
    expect(result.data.endpointOnly).toBe(true);
    expect(result.data.pathPct).toBeUndefined();
    expect(result.data.p50).toBe(100);
  });

  it('rejects structurally valid research-only artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iris-forecast-'));
    const path = join(dir, 'research.json');
    const origin = '2026-09-08T00:00:00.000Z';
    await writeFile(path, JSON.stringify({
      schema_version: 1, instrument: 'BTC/USD', venue: 'research', origin,
      target_end: '2026-10-08T00:00:00.000Z', horizon_days: 30,
      as_of: '2026-09-08T00:00:00.000Z', generated_at: '2026-09-08T01:00:00.000Z',
      feature_cutoff: '2026-09-07T23:00:00.000Z', training_cutoff: '2026-09-07T00:00:00.000Z',
      data_sha256: 'c'.repeat(64), model_version: 'ridge-v1', reference_price: 100,
      return_quantiles: { p10: -0.1, p50: 0, p90: 0.2 },
      price_quantiles: { p10: 100 * Math.exp(-0.1), p50: 100, p90: 100 * Math.exp(0.2) },
      calibration: { status: 'research_only' },
    }));
    process.env.IRIS_FORECAST_PATH = path;
    const result = await getMonthlyForecast({ symbol: 'BTC-USD' });
    expect(result.unavailable).toBe(true);
    expect(result.data.p50).toBeNull();
  });
});
