/**
 * Bitcoin network conditions from keyless sources.
 *
 * Four mempool.space reads carry the panel; one Blockchair read supplies two
 * extras nothing else provides. Failure policy follows `chainSupply/live.ts`:
 *
 *   - every mempool.space call failed  -> `null`, the honest "no data" answer
 *     that routes the page to the badged mock
 *   - some but not all failed          -> throw, so the reader gets a badged
 *     mock rather than a panel that is half real and half invented
 *   - Blockchair failed                -> keep going with `null` in its two
 *     fields. It is a supplement; losing it costs two numbers, not the page.
 */
import {
  getDifficultyAdjustment,
  getHashrateSeries,
  getMempoolState,
  getMiningPools,
  getRecommendedFees,
  getNetworkAsOf,
} from '@/lib/sources/mempool';
import { getChainStats } from '@/lib/sources/blockchair';
import type { ChainNetworkArgs, ChainNetworkData } from './types';

export async function fetchChainNetwork(_args: ChainNetworkArgs) {
  void _args;

  const [fees, mempool, difficulty, hashrate, pools, stats, netAsOf] = await Promise.allSettled([
    getRecommendedFees(),
    getMempoolState(),
    getDifficultyAdjustment(),
    getHashrateSeries(),
    getMiningPools(),
    getChainStats(),
    getNetworkAsOf(),
  ]);

  const core = [fees, mempool, difficulty, hashrate, pools];
  if (core.every((r) => r.status === 'rejected')) return null;

  if (
    fees.status !== 'fulfilled' ||
    mempool.status !== 'fulfilled' ||
    difficulty.status !== 'fulfilled' ||
    hashrate.status !== 'fulfilled' ||
    pools.status !== 'fulfilled'
  ) {
    throw new Error('chainNetwork: partial mempool.space failure — falling back to mock');
  }

  const points = hashrate.value.points;
  const first = points[0]?.ehs ?? 0;
  const last = points[points.length - 1]?.ehs ?? 0;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

  const data: ChainNetworkData = {
    fees: fees.value,
    mempool: {
      txCount: mempool.value.txCount,
      vsize: mempool.value.vsize,
      blocksToClear: mempool.value.blocksToClear,
      buckets: mempool.value.buckets,
    },
    difficulty: difficulty.value,
    hashrate: {
      points,
      currentEhs: hashrate.value.currentEhs,
      currentDifficulty: hashrate.value.currentDifficulty,
      changePct,
    },
    pools: pools.value,
    blocks24h: stats.status === 'fulfilled' ? stats.value.blocks24h : null,
    avgFeeUsd24h: stats.status === 'fulfilled' ? stats.value.avgFeeUsd24h : null,
  };

  // The newest block Blockchair has seen dates the fees and mempool on screen.
  // Render time would read fresh forever behind a cached response.
  const asOf = netAsOf.status === 'fulfilled' ? netAsOf.value : null;
  return { data, asOf, synthetic: false };
}
