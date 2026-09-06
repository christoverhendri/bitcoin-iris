import { defineFeature } from '@/lib/defineFeature';
import { fetchChainNetwork } from './live';
import { mockChainNetwork } from './mock';
import type { ChainNetworkArgs, ChainNetworkData } from './types';

export const getChainNetwork = defineFeature<ChainNetworkArgs, ChainNetworkData>({
  key: 'chain_network',
  source: 'mempool_space',
  live: fetchChainNetwork,
  mock: mockChainNetwork,
});

export type {
  ChainNetworkData,
  ChainNetworkArgs,
  DifficultyAdjustment,
  FeeBucket,
  HashratePoint,
  MempoolFees,
  MiningPool,
} from './types';

export {
  fmtFeeRate,
  fmtBacklog,
  fmtVsize,
  fmtHashrate,
  fmtDifficultyChange,
  isMempoolClear,
  congestionTier,
  bucketShares,
  blockPaceWord,
  toPoolRow,
  CONGESTION_COLOR,
  TARGET_BLOCKS_24H,
  type CongestionTier,
} from './present';
