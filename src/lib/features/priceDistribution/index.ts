import { defineFeature } from '@/lib/defineFeature';
import { fetchPriceDistribution } from './live';
import { mockPriceDistribution } from './mock';
import type { PriceDistributionArgs, PriceDistributionData } from './types';

export const getPriceDistribution = defineFeature<
  PriceDistributionArgs,
  PriceDistributionData
>({
  key: 'price_distribution',
  source: 'internal_distribution',
  live: fetchPriceDistribution,
  mock: mockPriceDistribution,
});

export type {
  PriceDistributionData,
  PriceDistributionArgs,
  HorizonBand,
  HistogramBin,
  ProbabilityLevel,
  HistoryPoint,
} from './types';

export {
  toDistributionLabels,
  toHorizonRow,
  bandTone,
  sampleTone,
  sampleVerdict,
  probTone,
  fmtProb,
  DISTRIBUTION_NOTE,
  METHOD_NOTE,
  SAMPLE_NOTE,
  DVOL_COMPARE_NOTE,
} from './present';
