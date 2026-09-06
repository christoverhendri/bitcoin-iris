import { defineFeature } from '@/lib/defineFeature';
import { fetchSnapshot } from './live';
import { mockSnapshot } from './mock';
import type { BtcSnapshot, SnapshotArgs } from './types';

export const getBtcSnapshot = defineFeature<SnapshotArgs, BtcSnapshot>({
  key: 'snapshot',
  source: 'coinbase',
  live: fetchSnapshot,
  mock: mockSnapshot,
});

export type { BtcSnapshot, SnapshotArgs };
export { toSnapshotRows, type SnapshotRow } from './present';
