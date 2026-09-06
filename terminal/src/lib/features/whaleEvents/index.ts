import { defineFeature } from '@/lib/defineFeature';
import { fetchWhaleEvents } from './live';
import { mockWhaleEvents } from './mock';
import type { WhaleEvent, WhaleEventsArgs } from './types';

const resolveWhaleEvents = defineFeature<WhaleEventsArgs, WhaleEvent[]>({
  key: 'whale_events',
  source: 'whale_alert',
  live: fetchWhaleEvents,
  mock: mockWhaleEvents,
});

export type { WhaleEvent, WhaleEventsArgs } from './types';
export {
  toWhaleEventRow,
  summarizeWhaleFlow,
  netflowColor,
  netflowWord,
  fmtAmount,
  type WhaleFlowSummary,
} from './present';

export async function getWhaleEvents(args: WhaleEventsArgs) {
  const env = await resolveWhaleEvents(args);
  return process.env.NODE_ENV !== 'development' && env.isMock ? { ...env, data: [] } : env;
}
