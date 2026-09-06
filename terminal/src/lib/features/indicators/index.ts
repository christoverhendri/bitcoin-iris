import { defineFeature } from '@/lib/defineFeature';
import { fetchIndicators } from './live';
import { mockIndicators } from './mock';
import type { IndicatorData, IndicatorArgs } from './types';

export const getIndicators = defineFeature<IndicatorArgs, IndicatorData>({
  key: 'indicators',
  source: 'internal_quant',
  live: fetchIndicators,
  mock: mockIndicators,
});

export type { IndicatorData, IndicatorArgs };
export { toIndicatorLabels } from './present';
