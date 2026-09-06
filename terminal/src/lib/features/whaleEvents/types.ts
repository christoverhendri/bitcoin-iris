import type { FlowBias, FlowKind } from '@/lib/onchain/classifyFlow';

/**
 * One whale movement on the wire.
 *
 * Deliberately a superset of `chainFlows`' `FlowTransfer` rather than a reuse of
 * it: that type is BTC-only and keyed on a UTXO txid, while this one spans every
 * chain Whale Alert covers and is keyed on the upstream event id. They share the
 * `kind` / `bias` / `impact` vocabulary, which is the part that matters — a
 * reader learns one set of words for both panels.
 */
export interface WhaleEvent {
  /** Upstream event id. Stable, so a re-fetch of the same movement dedupes. */
  id: string;
  /** ISO 8601. Stored as `timestamptz`, transported as a string. */
  ts: string;
  /** Lowercase chain name as the upstream reports it: `bitcoin`, `ethereum`, … */
  blockchain: string;
  /** Uppercase asset ticker: `BTC`, `USDT`, … */
  symbol: string;
  /** Amount in `symbol` units. */
  amount: number;
  amountUsd: number;
  fromLabel: string;
  toLabel: string;
  kind: FlowKind;
  bias: FlowBias;
  /** 0-100 attention score from `usdImpact`. */
  impact: number;
  /** Block explorer link, or `null` for a chain with no mapping. */
  txUrl: string | null;
}

export interface WhaleEventsArgs {
  limit?: number;
}
