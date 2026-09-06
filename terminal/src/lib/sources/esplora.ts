/**
 * Blockstream Esplora — keyless Bitcoin address / transaction lookups.
 *
 * No key, no account, no rate-limit header to respect beyond politeness. This is
 * the only upstream that can answer "what is the live balance of this address"
 * and "what moved through it recently" without a paid clustering provider, so
 * the whole exchange-flow feature sits on top of it.
 *
 * Every value Esplora returns is in satoshis; every value this module returns is
 * in BTC. The conversion happens here exactly once so no caller has to remember.
 *
 * The registry sweep is 15 addresses x 2 endpoints = 30 requests on a cold
 * render. The revalidate windows below are deliberately long — balances move on
 * the scale of blocks (~10 min), not seconds — so after the first hit inside a
 * window the whole sweep costs nothing.
 *
 * All functions throw on non-2xx, timeout, or a malformed payload. Callers wrap
 * them in `Promise.allSettled` so one dead address never sinks the aggregate.
 *
 * Docs: https://github.com/Blockstream/esplora/blob/master/API.md
 */
import { fetchJson } from './http';

const BASE = 'https://blockstream.info/api';

const SATS = 1e8;

export interface EsploraAddress {
  address: string;
  balanceBtc: number;
  txCount: number;
  fundedBtc: number;
  spentBtc: number;
}

/** One side of a transaction: the resolved address and its value in BTC. */
export interface EsploraTxIo {
  /** `null` for a coinbase input or an output with no standard address. */
  address: string | null;
  valueBtc: number;
}

export interface EsploraTx {
  txid: string;
  /** Seconds since epoch. `0` while the tx is still in the mempool. */
  blockTime: number;
  confirmed: boolean;
  vin: EsploraTxIo[];
  vout: EsploraTxIo[];
}

interface RawStats {
  funded_txo_sum?: number;
  spent_txo_sum?: number;
  tx_count?: number;
}

interface RawAddress {
  address?: string;
  chain_stats?: RawStats;
  mempool_stats?: RawStats;
}

interface RawIo {
  scriptpubkey_address?: string | null;
  value?: number;
}

interface RawTx {
  txid?: string;
  status?: { confirmed?: boolean; block_time?: number };
  vin?: { prevout?: RawIo | null }[];
  vout?: RawIo[];
}

const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * Process-level memo for the transaction sweep.
 *
 * A busy exchange address returns 2.5MB of transaction JSON, and Next refuses to
 * put anything over 2MB in its data cache — so `revalidate` silently stops
 * working for exactly the addresses we care about most, and every render would
 * refetch ~35MB across the registry.
 *
 * This closes that hole: the *parsed, reduced* result is held in memory, which
 * is a few KB per address rather than megabytes, keyed by address and expired on
 * the same schedule the fetch cache would have used. Entries are per-instance
 * and vanish on restart; that is the correct trade for a snapshot feature.
 */
const TXS_TTL_MS = 300_000;
const txsMemo = new Map<string, { at: number; value: EsploraTx[] }>();
const txsPending = new Map<string, Promise<EsploraTx[]>>();
const MAX_MEMO_ADDRESSES = 64;

/**
 * Live balance and lifetime activity for one address.
 *
 * Balance is `funded - spent` across confirmed history plus whatever is sitting
 * in the mempool, so a large deposit shows up before it confirms — which is the
 * whole point for a flow signal.
 */
export async function getAddress(addr: string): Promise<EsploraAddress> {
  const j = await fetchJson<RawAddress>(`${BASE}/address/${addr}`, { revalidate: 600 });
  if (!j || typeof j !== 'object' || !j.chain_stats) {
    throw new Error(`esplora /address/${addr}: malformed response`);
  }
  const chain = j.chain_stats;
  const pool = j.mempool_stats ?? {};

  const fundedSats = num(chain.funded_txo_sum) + num(pool.funded_txo_sum);
  const spentSats = num(chain.spent_txo_sum) + num(pool.spent_txo_sum);

  return {
    address: j.address ?? addr,
    balanceBtc: (fundedSats - spentSats) / SATS,
    txCount: num(chain.tx_count) + num(pool.tx_count),
    fundedBtc: fundedSats / SATS,
    spentBtc: spentSats / SATS,
  };
}

/**
 * The most recent transactions touching an address — Esplora returns up to 25
 * confirmed plus any mempool entries, newest first. That is the window the flow
 * radar sees; there is no pagination here on purpose, because a deeper history
 * would multiply the sweep cost without improving a "what just happened" signal.
 */
export async function getAddressTxs(addr: string): Promise<EsploraTx[]> {
  const hit = txsMemo.get(addr);
  if (hit && Date.now() - hit.at < TXS_TTL_MS) return hit.value;
  const pending = txsPending.get(addr);
  if (pending) return pending;

  const request = loadAddressTxs(addr);
  txsPending.set(addr, request);
  try {
    const value = await request;
    const now = Date.now();
    for (const [key, entry] of txsMemo) {
      if (now - entry.at >= TXS_TTL_MS) txsMemo.delete(key);
    }
    txsMemo.delete(addr);
    if (txsMemo.size >= MAX_MEMO_ADDRESSES) {
      txsMemo.delete(txsMemo.keys().next().value!);
    }
    txsMemo.set(addr, { at: now, value });
    return value;
  } finally {
    // Rejections are never cached; the next request can recover.
    txsPending.delete(addr);
  }
}

async function loadAddressTxs(addr: string): Promise<EsploraTx[]> {
  // 25 transactions from a high-throughput address can be several MB, and each
  // one may carry thousands of inputs. Give it more room than the default.
  const j = await fetchJson<RawTx[]>(`${BASE}/address/${addr}/txs`, {
    revalidate: 300,
    cache: 'no-store',
    timeoutMs: 20_000,
  });
  if (!Array.isArray(j)) throw new Error(`esplora /address/${addr}/txs: not an array`);

  const out: EsploraTx[] = [];
  for (const tx of j) {
    if (!tx?.txid) continue;
    out.push({
      txid: tx.txid,
      blockTime: num(tx.status?.block_time),
      confirmed: tx.status?.confirmed === true,
      // A coinbase input has no `prevout`. Treated as an unattributed zero-value
      // side so the classifier sees "not tracked" rather than crashing.
      vin: (tx.vin ?? []).map((i) => toIo(i?.prevout ?? null)),
      vout: (tx.vout ?? []).map((o) => toIo(o)),
    });
  }
  return out;
}

function toIo(raw: RawIo | null): EsploraTxIo {
  if (!raw) return { address: null, valueBtc: 0 };
  return {
    address: typeof raw.scriptpubkey_address === 'string' ? raw.scriptpubkey_address : null,
    valueBtc: num(raw.value) / SATS,
  };
}

/** Fee estimates in sat/vB keyed by confirmation target in blocks. */
export async function getFeeEstimates(): Promise<Record<string, number>> {
  const j = await fetchJson<Record<string, number>>(`${BASE}/fee-estimates`, { revalidate: 600 });
  if (!j || typeof j !== 'object') throw new Error('esplora /fee-estimates: malformed response');
  return j;
}
