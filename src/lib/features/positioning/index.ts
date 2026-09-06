import { defineFeature } from '@/lib/defineFeature';
import { fetchPositioning } from './live';
import { mockPositioning } from './mock';
import type { PositioningArgs, PositioningData } from './types';

export const getPositioning = defineFeature<PositioningArgs, PositioningData>({
  key: 'positioning',
  source: 'positioning',
  live: fetchPositioning,
  mock: mockPositioning,
});

export type {
  PositioningData,
  PositioningArgs,
  RatioPoint,
  TakerPoint,
  VenuePrice,
} from './types';
export {
  toPositioningLabels,
  ratioTone,
  biasTone,
  premiumTone,
  divergenceTone,
  CROWDING_NOTE,
  SINGLE_VENUE_NOTE,
  PREMIUM_NOTE,
  TAKER_NOTE,
} from './present';
