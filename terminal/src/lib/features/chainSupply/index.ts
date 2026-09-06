import { defineFeature } from '@/lib/defineFeature';
import { fetchChainSupply } from './live';
import { mockChainSupply } from './mock';
import type { ChainSupplyMetrics, ChainSupplyArgs } from './types';

export const getChainSupply = defineFeature<ChainSupplyArgs, ChainSupplyMetrics>({
  key: 'chain_supply',
  source: 'onchain_provider',
  live: fetchChainSupply,
  mock: mockChainSupply,
});

export type { ChainSupplyMetrics, ChainSupplyArgs };
export { toChainSupplyLabels } from './present';
