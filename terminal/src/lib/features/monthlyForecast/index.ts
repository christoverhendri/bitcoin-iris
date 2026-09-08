import { defineFeature } from '@/lib/defineFeature';
import { live, unavailable } from '@/lib/envelope';
import { getSourceStatus } from '@/lib/sourceStatus';
import { loadForecastArtifact, ForecastArtifactError } from './artifact';
import { fetchMonthlyForecast } from './live';
import { mockMonthlyForecast } from './mock';
import type { MonthlyForecastPath, MonthlyForecastArgs } from './types';

const legacyMonthlyForecast = defineFeature<MonthlyForecastArgs, MonthlyForecastPath>({
  key: 'monthly_forecast',
  source: 'internal_forecast',
  live: fetchMonthlyForecast,
  mock: mockMonthlyForecast,
});

export async function getMonthlyForecast(args: MonthlyForecastArgs): Promise<import('@/lib/envelope').Envelope<MonthlyForecastPath>> {
  const configuredPath = process.env.IRIS_FORECAST_PATH?.trim();
  if (!configuredPath) return legacyMonthlyForecast(args);
  try {
    if (args.symbol && !['BTC', 'BTC-USD', 'BTC/USD'].includes(args.symbol)) throw new ForecastArtifactError('Configured forecast supports BTC/USD only');
    const status = await getSourceStatus('internal_forecast');
    if (status && (!status.is_enabled || ['failed', 'degraded', 'mock'].includes(status.mode))) {
      throw new ForecastArtifactError('Configured forecast source is disabled or unavailable');
    }
    const artifact = await loadForecastArtifact(configuredPath);
    if (artifact.calibration.status !== 'validated') throw new ForecastArtifactError('Configured forecast artifact is research-only and not approved for terminal display');
    return live({ p10: artifact.price_quantiles.p10, p50: artifact.price_quantiles.p50, p90: artifact.price_quantiles.p90,
      endpointOnly: true, method: artifact.method ?? artifact.model_family ?? artifact.model_version, origin: artifact.origin,
      provenance: artifact.provenance ?? artifact.venue, horizonDays: artifact.horizon_days, targetEnd: artifact.target_end }, 'internal_forecast', artifact.origin);
  } catch (error) {
    const message = error instanceof ForecastArtifactError ? error.message : 'Configured forecast artifact unavailable';
    return unavailable({ p10: null, p50: null, p90: null, method: 'Unavailable' }, 'internal_forecast', message);
  }
}

export type { MonthlyForecastPath, MonthlyForecastArgs };
export { toMonthlyForecastLabels, getMonthlyPathColor } from './present';
