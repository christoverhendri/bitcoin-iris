import { defineFeature } from '@/lib/defineFeature';
import { fetchMacroCountry } from './live';
import { mockMacroCountry } from './mock';
import type { MacroMetric, MacroCountryArgs } from './types';

export const getMacroCountry = defineFeature<MacroCountryArgs, MacroMetric[]>({
  key: 'macro_country',
  source: 'fred',
  live: fetchMacroCountry,
  mock: mockMacroCountry,
});

export type { MacroMetric, MacroCountryArgs };
export { toMacroCountryLabels, getMacroZScoreColor } from './present';
