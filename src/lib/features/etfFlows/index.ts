import { defineFeature } from '@/lib/defineFeature';
import { fetchEtfFlows } from './live';
import { mockEtfFlows } from './mock';
import type { EtfFlowsArgs, EtfFlowsData } from './types';

export const getEtfFlows = defineFeature<EtfFlowsArgs, EtfFlowsData>({
  key: 'etfFlows',
  source: 'etf_flows',
  live: fetchEtfFlows,
  mock: mockEtfFlows,
});

export type { EtfFlowsData, EtfFlowsArgs, EtfFlowSession, EtfFundRow } from './types';
export {
  toEtfLabels,
  fmtUsdM,
  flowTone,
  streakLabel,
  streakTone,
  ETF_WINDOW_NOTE,
  ETF_SOURCE_NOTE,
  ETF_SETTLEMENT_NOTE,
} from './present';
