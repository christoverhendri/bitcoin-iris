import { defineFeature } from '@/lib/defineFeature';
import { fetchDerivatives } from './live';
import { mockDerivatives } from './mock';
import type { DerivativesArgs, DerivativesData } from './types';
import { MAX_AGE_SEC } from '@/lib/maxAge';

export const getDerivatives = defineFeature<DerivativesArgs, DerivativesData>({
  key: 'derivatives',
  source: 'derivatives',
  live: fetchDerivatives,
  mock: mockDerivatives,
  maxAgeSec: MAX_AGE_SEC.derivatives,
});

export type { DerivativesData, DerivativesArgs, FundingPoint } from './types';
export {
  toDerivativesLabels,
  fundingTone,
  FUNDING_NOTE,
  DVOL_NOTE,
  MAXPAIN_NOTE,
} from './present';
