import 'server-only';
import { getOhlcv } from './features/ohlcv';
import { buildMarketSnapshot } from './marketSnapshot';
import type { OhlcvArgs } from './features/ohlcv/types';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDerivedMarket } from './sources/derivedMarket';
import { unavailable } from './envelope';
export async function getMarketSnapshot(args:OhlcvArgs) {
  const directory=process.env.IRIS_MARKET_ARCHIVE_DIR||resolve(process.cwd(),'..','artifacts','market');
  if(existsSync(resolve(directory,'coinbase_hourly_from_minutes.sqlite'))){
    try { const {env,cutoff}=readDerivedMarket(args,directory);return buildMarketSnapshot(env,cutoff); }
    catch { return buildMarketSnapshot(unavailable([],'coinbase','Minute-derived snapshot unavailable; original candles were not substituted.'),Date.now()); }
  }
  const cutoff=Date.now();
  return buildMarketSnapshot(await getOhlcv(args),cutoff);
}
