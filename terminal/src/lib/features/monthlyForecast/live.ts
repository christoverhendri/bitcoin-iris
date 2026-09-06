/**
 * Live 30-day forecast — bootstrap Monte Carlo over ~1y of real daily closes
 * (CoinGecko, Kraken fallback). Deterministic: the resampling PRNG is seeded off
 * the UTC day, so the projection is stable within a day and drifts day to day.
 */
import { getDailyCloses } from '@/lib/sources/coingecko';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { bootstrapPaths } from '@/lib/quant/montecarlo';
import { dateSeed } from '@/lib/rng';
import type { MonthlyForecastPath, MonthlyForecastArgs } from './types';

const HORIZON_DAYS = 30;
const N_PATHS = 2000;

export async function fetchMonthlyForecast({ symbol = 'BTC' }: MonthlyForecastArgs) {
  void symbol;

  let closes: number[];
  try {
    closes = (await getDailyCloses(365)).map((d) => d.close);
    if (closes.length < 60) throw new Error('not enough coingecko closes');
  } catch {
    closes = (await krakenCandles('1d', 'XBTUSD')).map((c) => c.close);
  }
  if (closes.length < 60) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (logReturns.length < 30) return null;

  const lastClose = closes[closes.length - 1];
  const seed = dateSeed('monthly_forecast', new Date());
  const result = bootstrapPaths(logReturns, HORIZON_DAYS, N_PATHS, seed);

  const data: MonthlyForecastPath = {
    p10: lastClose * result.p10,
    p50: lastClose * result.p50,
    p90: lastClose * result.p90,
    pathPct: result.medianPathPct,
  };

  return {
    data,
    asOf: new Date().toISOString(),
    synthetic: false,
  };
}
