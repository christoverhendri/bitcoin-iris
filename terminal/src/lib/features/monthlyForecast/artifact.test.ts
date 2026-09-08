import { describe, expect, it } from 'vitest';
import { validateForecastArtifact } from './artifact';

const origin = '2026-09-08T00:00:00.000Z';
const valid = {
  schema_version: 1, instrument: 'BTC/USD', venue: 'research', origin,
  target_end: '2026-10-08T00:00:00.000Z', horizon_days: 30,
  feature_cutoff: '2026-09-07T23:00:00.000Z', training_cutoff: '2026-09-07T00:00:00.000Z',
  data_sha256: 'a'.repeat(64), model_version: 'ridge-v1', reference_price: 100,
  return_quantiles: { p10: -0.1, p50: 0, p90: 0.2 },
  price_quantiles: { p10: 100 * Math.exp(-0.1), p50: 100, p90: 100 * Math.exp(0.2) },
  calibration: { status: 'validated' },
};

describe('forecast artifact contract', () => {
  it('accepts a coherent validated artifact', () => {
    expect(validateForecastArtifact(valid, Date.parse(origin) + 24 * 60 * 60 * 1000).model_version).toBe('ridge-v1');
  });

  it('accepts Python UTC offsets while retaining the schema contract', () => {
    const pythonUtc = { ...valid, origin: '2026-09-08T00:00:00+00:00', target_end: '2026-10-08T00:00:00+00:00', feature_cutoff: '2026-09-07T23:00:00+00:00', training_cutoff: '2026-09-07T00:00:00+00:00' };
    expect(validateForecastArtifact(pythonUtc, Date.parse(origin) + 24 * 60 * 60 * 1000).origin).toBe(pythonUtc.origin);
  });

  it('rejects exponential price overflow', () => {
    const overflow = { ...valid, reference_price: Number.MAX_VALUE, return_quantiles: { p10: 0, p50: 0, p90: 1 }, price_quantiles: { p10: Number.MAX_VALUE, p50: Number.MAX_VALUE, p90: Number.MAX_VALUE } };
    expect(() => validateForecastArtifact(overflow, Date.parse(origin) + 24 * 60 * 60 * 1000)).toThrow(/overflows/);
  });

  it.each([
    ['future origin', { origin: '2026-09-09T00:00:00.000Z' }],
    ['stale origin', { origin: '2026-09-01T00:00:00.000Z', target_end: '2026-10-01T00:00:00.000Z' }],
    ['wrong price transform', { price_quantiles: { ...valid.price_quantiles, p50: 101 } }],
    ['invalid calibration', { calibration: { status: 'unverified' } }],
    ['invalid metadata', { method: { name: 'ridge' } }],
    ['invalid calendar date', { training_cutoff: '2026-02-30T00:00:00Z' }],
  ])('rejects %s', (_name, change) => {
    expect(() => validateForecastArtifact({ ...valid, ...change }, Date.parse(origin) + 24 * 60 * 60 * 1000)).toThrow();
  });
});
