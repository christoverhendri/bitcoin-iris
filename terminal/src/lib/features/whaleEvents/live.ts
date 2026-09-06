/**
 * Whale events, read from Supabase.
 *
 * This is the first feature in the terminal whose live path is the database
 * rather than an upstream API, and that is forced by the source: the Whale Alert
 * free tier only ever returns the last ~10 minutes. Fetching upstream on render
 * would produce a "feed" that is empty most of the time and has no history at
 * all. The table is written by `/api/ingest/whale`; this file only reads.
 *
 * Failure policy is the house one: `getSupabase()` returns `null` when the
 * project is unconfigured, an empty table is a normal pre-ingestion state, and
 * both resolve to `null` here — which routes the panel to the badged mock
 * without a single special case in a component.
 */
import { getSupabase, asRow } from '@/lib/supabase/server';
import type { FlowBias, FlowKind } from '@/lib/onchain/classifyFlow';
import type { WhaleEvent, WhaleEventsArgs } from './types';

/**
 * The columns this query selects, declared locally. Needed while
 * `database.types.ts` is a placeholder, and worth keeping afterwards because it
 * documents the query at the call site.
 */
interface WhaleEventRow {
  id: string;
  ts: string;
  blockchain: string;
  symbol: string;
  amount: number | string;
  amount_usd: number | string;
  from_label: string | null;
  to_label: string | null;
  kind: string;
  bias: string;
  impact: number;
  tx_url: string | null;
  is_synthetic: boolean;
}

const COLUMNS =
  'id, ts, blockchain, symbol, amount, amount_usd, from_label, to_label, kind, bias, impact, tx_url, is_synthetic';

/** Postgres `numeric` arrives as a string through PostgREST. */
const num = (v: number | string | null): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

export async function fetchWhaleEvents({ limit = 50 }: WhaleEventsArgs) {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from('whale_events')
    .select(COLUMNS)
    .order('ts', { ascending: false })
    .limit(Math.min(Math.max(1, limit), 200));

  // Let `defineFeature` badge this as `query_error` rather than swallowing it —
  // a misconfigured table should be visible, not silently indistinguishable
  // from a quiet market.
  if (error) throw new Error(`whale_events: ${error.message}`);

  const rows = (data ?? []).map(asRow<WhaleEventRow>);
  if (rows.length === 0) return null;

  const events: WhaleEvent[] = rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    blockchain: r.blockchain,
    symbol: r.symbol,
    amount: num(r.amount),
    amountUsd: num(r.amount_usd),
    fromLabel: r.from_label ?? 'Unknown wallet',
    toLabel: r.to_label ?? 'Unknown wallet',
    kind: r.kind as FlowKind,
    bias: r.bias as FlowBias,
    impact: r.impact,
    txUrl: r.tx_url,
  }));

  // One synthetic row taints the batch. There is only one way for placeholder
  // data to reach a pixel and it is always labelled.
  const synthetic = rows.some((r) => r.is_synthetic);

  return { data: events, asOf: events[0].ts, synthetic };
}
