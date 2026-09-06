import { seeded, between, intBetween, pick, utcDay } from '@/lib/rng';
import { EXCHANGE_ADDRESSES, TRACKED_ADDRESS_COUNT, TRACKED_EXCHANGES } from '@/lib/onchain/exchangeRegistry';
import { flowImpact, BIAS_BY_FLOW_KIND, type FlowKind } from '@/lib/onchain/classifyFlow';
import type { ChainFlowsArgs, ChainFlowsData, FlowTransfer } from './types';

/**
 * PLACEHOLDER — shown only when the Esplora sweep is unreachable.
 *
 * The shape is identical to the live payload, so no component has a mock branch.
 * Balances are anchored to the registry's `balanceAtVerifyBtc` snapshots (the
 * closest honest stand-in for a live figure) and the transfers are invented.
 *
 * Deterministic by construction: the only clock it reads is the UTC date, via
 * `seeded` / `utcDay`. No `Math.random`, no `Date.now` — SSR and hydration must
 * produce byte-identical output.
 */

const KINDS: FlowKind[] = [
  'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW',
  'HOT_LOADING',
  'COLD_STORING',
  'INTER_EXCHANGE',
];

export function mockChainFlows({ symbol = 'BTC' }: ChainFlowsArgs): ChainFlowsData {
  const r = seeded(`chain_flows_${symbol}`);

  const hotBtc = EXCHANGE_ADDRESSES.filter((a) => a.kind === 'hot').reduce((s, a) => s + a.balanceAtVerifyBtc, 0);
  const coldBtc = EXCHANGE_ADDRESSES.filter((a) => a.kind === 'cold').reduce((s, a) => s + a.balanceAtVerifyBtc, 0);
  const depositBtc = EXCHANGE_ADDRESSES.filter((a) => a.kind === 'deposit').reduce((s, a) => s + a.balanceAtVerifyBtc, 0);

  // Midnight UTC today, in seconds — a stable clock for the synthetic timeline.
  const dayStartSec = Math.floor(Date.parse(`${utcDay()}T00:00:00.000Z`) / 1000);

  const count = intBetween(r, 10, 18);
  const transfers: FlowTransfer[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pick(r, KINDS);
    const exchange = pick(r, TRACKED_EXCHANGES);
    const amountBtc = Math.round(between(r, 60, 2400) * 100) / 100;
    transfers.push({
      txid: `mock${i.toString().padStart(2, '0')}${'0'.repeat(58)}`.slice(0, 64),
      blockTime: dayStartSec + intBetween(r, 0, 82_800) - i * 600,
      amountBtc,
      kind,
      bias: BIAS_BY_FLOW_KIND[kind],
      exchange,
      fromLabel: kind === 'EXCHANGE_INFLOW' ? 'External wallet' : `${exchange} wallet`,
      toLabel: kind === 'EXCHANGE_OUTFLOW' ? 'External wallet' : `${exchange} wallet`,
      impact: flowImpact(amountBtc),
    });
  }
  transfers.sort((a, b) => b.blockTime - a.blockTime);

  const inflow = transfers.filter((t) => t.kind === 'EXCHANGE_INFLOW').reduce((s, t) => s + t.amountBtc, 0);
  const outflow = transfers.filter((t) => t.kind === 'EXCHANGE_OUTFLOW').reduce((s, t) => s + t.amountBtc, 0);
  const netflowBtc = inflow - outflow;

  return {
    inflow,
    outflow,
    cumulative: netflowBtc,
    netflowBtc,
    trackedReserveBtc: hotBtc + coldBtc + depositBtc,
    hotBtc,
    coldBtc,
    depositBtc,
    transfers,
    addressCount: TRACKED_ADDRESS_COUNT,
    exchangeCount: TRACKED_EXCHANGES.length,
  };
}
