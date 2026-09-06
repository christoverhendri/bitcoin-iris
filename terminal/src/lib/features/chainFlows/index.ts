import { defineFeature } from '@/lib/defineFeature';
import { fetchChainFlows } from './live';
import { mockChainFlows } from './mock';
import type { ChainFlowsData, ChainFlowsArgs } from './types';

export const getChainFlows = defineFeature<ChainFlowsArgs, ChainFlowsData>({
  key: 'chain_flows',
  source: 'onchain_provider',
  live: fetchChainFlows,
  mock: mockChainFlows,
});

export type { ChainFlowsData, ChainFlowsArgs, FlowTransfer } from './types';
export { toChainFlowsLabels, getChainFlowsColor, toFlowTransferRow } from './present';
