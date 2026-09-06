import { fmtCompact, fmtPct } from '@/lib/format';
import type { ChainSupplyMetrics } from './types';

export function toChainSupplyLabels(m: ChainSupplyMetrics) {
  return {
    activeAddresses: fmtCompact(m.activeAddresses, ''),
    volume24hBtc: m.volume24hBtc == null ? '—' : `${fmtCompact(m.volume24hBtc, '')} BTC`,
    txCount: fmtCompact(m.txCount, ''),
    hashRate: `${m.hashRate.toFixed(2)} EH/s`,
    coldPct: fmtPct(m.coldPct, false),
    hotPct: fmtPct(m.hotPct, false),
  };
}
