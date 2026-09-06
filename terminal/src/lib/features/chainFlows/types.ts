import type { FlowBias, FlowKind } from '@/lib/onchain/classifyFlow';

/** One classified movement, flattened for transport to the client components. */
export interface FlowTransfer {
  txid: string;
  /** Seconds since epoch; `0` for an unconfirmed mempool transfer. */
  blockTime: number;
  amountBtc: number;
  kind: FlowKind;
  bias: FlowBias;
  exchange: string;
  fromLabel: string;
  toLabel: string;
  impact: number;
}

export interface ChainFlowsData {
  /**
   * `inflow` / `outflow` / `cumulative` are BTC totals over the observed
   * transfer window. They predate the registry rework and are kept because
   * `NetflowChart` and `FlowsTable` read them.
   */
  inflow: number;
  outflow: number;
  cumulative: number;

  /** `inflow - outflow`. Positive = net deposits = sell pressure. */
  netflowBtc: number;

  /** Live balances summed across the tracked registry — a subset, never a total. */
  trackedReserveBtc: number;
  hotBtc: number;
  coldBtc: number;
  depositBtc: number;

  transfers: FlowTransfer[];
  addressCount: number;
  exchangeCount: number;
}

export interface ChainFlowsArgs {
  symbol?: string;
  days?: number;
}
