import { readFile } from 'node:fs/promises';

export interface ForecastArtifact {
  schema_version: 1;
  instrument: 'BTC/USD';
  venue: string;
  origin: string;
  target_end: string;
  horizon_days: 30;
  feature_cutoff: string;
  training_cutoff: string;
  data_sha256: string;
  model_version: string;
  reference_price: number;
  return_quantiles: { p10: number; p50: number; p90: number };
  price_quantiles: { p10: number; p50: number; p90: number };
  calibration: { status: 'research_only' | 'validated'; [key: string]: unknown };
  method?: string;
  model_family?: string;
  provenance?: string;
}

export class ForecastArtifactError extends Error {}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
type Quantiles = { p10: number; p50: number; p90: number };
const isQuantiles = (value: unknown): value is Quantiles => {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  return isFiniteNumber(q.p10) && isFiniteNumber(q.p50) && isFiniteNumber(q.p90) && q.p10 <= q.p50 && q.p50 <= q.p90;
};
const isoUtc = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
};

function fail(message: string): never {
  throw new ForecastArtifactError(`Invalid forecast artifact: ${message}`);
}

export function validateForecastArtifact(raw: unknown, now = Date.now()): ForecastArtifact {
  if (!raw || typeof raw !== 'object') fail('root must be an object');
  const a = raw as Record<string, unknown>;
  if (a.schema_version !== 1 || a.instrument !== 'BTC/USD' || a.horizon_days !== 30) fail('unsupported schema, instrument, or horizon');
  if (typeof a.venue !== 'string' || !a.venue.trim()) fail('venue is required');
  if (!isoUtc(a.origin) || !isoUtc(a.target_end) || !isoUtc(a.feature_cutoff) || !isoUtc(a.training_cutoff)) fail('timestamps must be ISO UTC');
  const origin = Date.parse(a.origin as string);
  if (origin > now) fail('origin is in the future');
  if (now - origin > 48 * 60 * 60 * 1000) fail('origin is older than 48 hours');
  if (Date.parse(a.target_end as string) !== origin + 30 * 24 * 60 * 60 * 1000) fail('target_end must equal origin plus 30 days');
  if (Date.parse(a.feature_cutoff as string) > origin) fail('feature_cutoff is after origin');
  if (Date.parse(a.training_cutoff as string) >= origin) fail('training_cutoff must precede origin');
  if (typeof a.data_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(a.data_sha256)) fail('data_sha256 must be 64 hex characters');
  if (typeof a.model_version !== 'string' || !a.model_version.trim()) fail('model_version is required');
  for (const key of ['method', 'model_family', 'provenance']) {
    if (a[key] !== undefined && typeof a[key] !== 'string') fail(`${key} must be a string`);
  }
  if (!isFiniteNumber(a.reference_price) || a.reference_price <= 0) fail('reference_price must be positive');
  for (const name of ['return_quantiles', 'price_quantiles']) {
    const q = a[name];
    if (!isQuantiles(q)) fail(`${name} must be finite and sorted`);
  }
  const rq = a.return_quantiles as { p10: number; p50: number; p90: number };
  const pq = a.price_quantiles as { p10: number; p50: number; p90: number };
  if ([pq.p10, pq.p50, pq.p90].some((v) => v <= 0)) fail('price_quantiles must be positive');
  for (const key of ['p10', 'p50', 'p90'] as const) {
    const expected = (a.reference_price as number) * Math.exp(rq[key]);
    if (!Number.isFinite(expected) || expected <= 0) fail(`price_quantiles.${key} expected value overflows or underflows`);
    if (Math.abs(pq[key] - expected) > Math.max(1e-8, Math.abs(expected) * 1e-8)) fail(`price_quantiles.${key} does not match return quantile`);
  }
  const calibration = a.calibration;
  if (!calibration || typeof calibration !== 'object') fail('calibration.status is invalid');
  const calibrationStatus = (calibration as Record<string, unknown>).status;
  if (calibrationStatus !== 'research_only' && calibrationStatus !== 'validated') fail('calibration.status is invalid');
  return a as unknown as ForecastArtifact;
}

export async function loadForecastArtifact(path: string, now = Date.now()): Promise<ForecastArtifact> {
  let text: string;
  try { text = await readFile(path, 'utf8'); } catch { throw new ForecastArtifactError(`cannot read configured artifact: ${path}`); }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new ForecastArtifactError('artifact is not valid JSON'); }
  return validateForecastArtifact(raw, now);
}
