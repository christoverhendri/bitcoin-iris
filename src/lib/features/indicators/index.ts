import { defineFeature } from '@/lib/defineFeature';
import { candleMaxAgeSec } from '@/lib/maxAge';
import { fetchIndicators } from './live';
import { mockIndicators } from './mock';
import type { IndicatorData, IndicatorArgs } from './types';

export const getIndicators = defineFeature<IndicatorArgs, IndicatorData>({
  key: 'indicators',
  source: 'internal_quant',
  live: fetchIndicators,
  mock: mockIndicators,
  maxAgeSec: (a) => candleMaxAgeSec(a.interval ?? '1d'),
});

export type { IndicatorData, IndicatorArgs };
export { toIndicatorLabels } from './present';
