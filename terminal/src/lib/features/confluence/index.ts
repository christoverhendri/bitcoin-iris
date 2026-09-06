import { defineFeature } from '@/lib/defineFeature';
import { fetchConfluence } from './live';
import { mockConfluence } from './mock';
import type { ConfluenceData, ConfluenceArgs } from './types';

export const getConfluence = defineFeature<ConfluenceArgs, ConfluenceData>({
  key: 'confluence',
  source: 'internal_confluence',
  live: fetchConfluence,
  mock: mockConfluence,
});

export type { ConfluenceData, ConfluenceArgs };
export { toConfluenceLabels, getConfluenceColor, LAYER_DESCRIPTIONS } from './present';
