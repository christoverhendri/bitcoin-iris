import { seeded } from '@/lib/rng';
import type { ChainSupplyMetrics, ChainSupplyArgs } from './types';

export function mockChainSupply({ symbol = 'BTC' }: ChainSupplyArgs): ChainSupplyMetrics {
  const r = seeded(`chain_supply_${symbol}`);
  
  return {
    activeAddresses: 900000 + Math.floor(r() * 200000),
    volume24hBtc: 200000 + Math.floor(r() * 400000),
    txCount: 400000 + Math.floor(r() * 100000),
    hashRate: 500 + r() * 100,
    coldPct: 60 + r() * 10,
    hotPct: 30 + r() * 10,
  };
}
