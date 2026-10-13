import 'server-only';
import { getOhlcv } from './features/ohlcv';
import { buildMarketSnapshot } from './marketSnapshot';
import type { OhlcvArgs } from './features/ohlcv/types';
export async function getMarketSnapshot(args:OhlcvArgs) {
  const cutoff=Date.now();
  return buildMarketSnapshot(await getOhlcv(args),cutoff);
}
