import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchMacroMarkets } from './live';
import { mockMacroMarkets } from './mock';
import type { MacroMarketsArgs, MacroMarketsData } from './types';

export const getMacroMarkets = defineFeature<MacroMarketsArgs, MacroMarketsData>({
  key: 'macroMarkets',
  source: 'yfinance',
  live: fetchMacroMarkets,
  mock: mockMacroMarkets,
  maxAgeSec: MAX_AGE_SEC.macroMarkets,
});

export type { MacroMarketsData, MacroMarketsArgs, MarketSeries, MarketKind } from './types';
export {
  toMacroMarketRows,
  fmtLevel,
  fmtCorr,
  fmtZ1y,
  corrTone,
  zTone,
  CORR_NOTE,
  Z_NOTE,
  YAHOO_NOTE,
} from './present';
