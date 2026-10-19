import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchPowerLaw } from './live';
import { mockPowerLaw } from './mock';
import type { PowerLawArgs, PowerLawData } from './types';

export const getPowerLaw = defineFeature<PowerLawArgs, PowerLawData>({
  key: 'powerLawCorridor',
  source: 'coinmetrics',
  live: fetchPowerLaw,
  mock: mockPowerLaw,
  maxAgeSec: MAX_AGE_SEC.dailyClose,
});

export type { PowerLawArgs, PowerLawData };
