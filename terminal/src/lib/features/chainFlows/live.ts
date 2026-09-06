/**
 * Exchange flow intelligence, built from the verified address registry.
 *
 * Two sweeps over the same 15 addresses:
 *   1. balances  -> tracked reserve and its hot / cold / deposit split
 *   2. recent tx -> classified transfers, each carrying a directional bias
 *
 * This is a real measurement of a curated subset, not an estimate of the whole
 * market. Exchanges hold coins across thousands of addresses; we watch fifteen.
 * Every panel downstream is required to say so.
 *
 * Failure policy: each request is settled independently. A single unreachable
 * address costs one address of coverage, nothing more. `null` — the honest "no
 * data" answer that routes the page to the badged mock — is returned only when
 * every balance lookup failed.
 */
import { EXCHANGE_ADDRESSES } from '@/lib/onchain/exchangeRegistry';
import { sweepRegistryBalances } from '@/lib/onchain/reserves';
import { getAddressTxs } from '@/lib/sources/esplora';
import { classifyTx } from '@/lib/onchain/classifyFlow';
import type { ChainFlowsArgs, ChainFlowsData, FlowTransfer } from './types';

/** Below this a transfer is retail noise, not a flow worth a row. */
const MIN_TRANSFER_BTC = 50;

/** The radar shows a working set, not an archive. */
const MAX_TRANSFERS = 40;

export async function fetchChainFlows(_args: ChainFlowsArgs) {
  void _args;

  const [sweep, txSettled] = await Promise.all([
    sweepRegistryBalances(),
    Promise.allSettled(EXCHANGE_ADDRESSES.map((a) => getAddressTxs(a.address))),
  ]);

  // Every balance lookup failed — Esplora is down or blocked. Say "no data".
  if (sweep.ok === 0) return null;

  // The same transaction is returned by both the sending and receiving address,
  // so dedupe by txid before classifying.
  const byTxid = new Map<string, FlowTransfer>();
  for (const res of txSettled) {
    if (res.status !== 'fulfilled') continue;
    for (const tx of res.value) {
      if (byTxid.has(tx.txid)) continue;
      const flow = classifyTx(tx, MIN_TRANSFER_BTC);
      if (flow) byTxid.set(tx.txid, flow);
    }
  }

  const transfers = [...byTxid.values()]
    // Unconfirmed transfers carry blockTime 0; float them to the top, they are
    // the newest thing on the wire.
    .sort((a, b) => (b.blockTime || Infinity) - (a.blockTime || Infinity))
    .slice(0, MAX_TRANSFERS);

  const inflow = transfers
    .filter((t) => t.kind === 'EXCHANGE_INFLOW')
    .reduce((s, t) => s + t.amountBtc, 0);
  const outflow = transfers
    .filter((t) => t.kind === 'EXCHANGE_OUTFLOW')
    .reduce((s, t) => s + t.amountBtc, 0);
  const netflowBtc = inflow - outflow;

  const data: ChainFlowsData = {
    inflow,
    outflow,
    cumulative: netflowBtc,
    netflowBtc,
    trackedReserveBtc: sweep.totalBtc,
    hotBtc: sweep.hotBtc,
    coldBtc: sweep.coldBtc,
    depositBtc: sweep.depositBtc,
    transfers,
    addressCount: sweep.ok,
    exchangeCount: sweep.exchangeCount,
  };

  const newest = transfers.reduce((m, t) => Math.max(m, t.blockTime), 0);
  const asOf = newest > 0 ? new Date(newest * 1000).toISOString() : new Date().toISOString();

  return { data, asOf, synthetic: false };
}
