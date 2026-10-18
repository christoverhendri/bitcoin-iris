import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchSnapshot } from './live';
import { mockSnapshot } from './mock';
import type { BtcSnapshot, SnapshotArgs } from './types';

export const getBtcSnapshot = defineFeature<SnapshotArgs, BtcSnapshot>({
  key: 'snapshot',
  source: 'coinbase',
  live: fetchSnapshot,
  mock: mockSnapshot,
  maxAgeSec: MAX_AGE_SEC.spot,
});

export type { BtcSnapshot, SnapshotArgs };
export { toSnapshotRows, type SnapshotRow } from './present';
