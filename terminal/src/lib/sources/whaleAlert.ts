/**
 * Whale Alert — DORMANT until `WHALE_ALERT_API_KEY` is set.
 *
 * Why this and not X/Twitter: the `@whale_alert` account is a *rendering* of
 * this API. Reading the API directly is faster, structured, and does not depend
 * on a platform that actively blocks readers. Probed 2026-09-03, every public
 * Nitter instance returned 410 / 403 / 429 / NXDOMAIN, and the one that answered
 * (xcancel) served a "RSS reader not yet whitelisted" notice instead of tweets.
 *
 * Free tier, and the shape of everything below follows from it:
 *   - minimum reportable transfer is $500,000
 *   - the query window may not start more than 3600s ago, and in practice the
 *     tier only returns the last ~10 minutes
 *   - 60 requests/minute
 *   - no historical access at all
 *
 * That last point is why this source is paired with a database. A single call
 * can only ever see the last few minutes; the feed's history lives in Supabase,
 * written by `/api/ingest/whale`.
 *
 * Like `sources/arkham.ts`, every function here throws when the key is missing.
 * `defineFeature` catches it and falls back to the badged mock.
 */
import { fetchJson } from './http';
import {
  BIAS_BY_FLOW_KIND,
  usdImpact,
  type FlowBias,
  type FlowKind,
} from '@/lib/onchain/classifyFlow';

const BASE = 'https://api.whale-alert.io/v1';

/** Free tier floor. Sending a lower `min_value` is rejected, not clamped. */
export const MIN_VALUE_USD = 500_000;

/**
 * How far back a request may look. The API caps `start` at one hour, but the
 * free tier serves roughly ten minutes; asking for more returns an error that
 * looks exactly like a bad key, so the clamp is here rather than at the caller.
 */
export const MAX_LOOKBACK_SEC = 600;

function key(): string {
  const k = process.env.WHALE_ALERT_API_KEY;
  if (!k) throw new Error('WHALE_ALERT_API_KEY not set — Whale Alert path is dormant');
  return k;
}

/** True when the key is present. The ingestion route uses this to 503 early. */
export const isWhaleAlertEnabled = (): boolean => Boolean(process.env.WHALE_ALERT_API_KEY);

/** Raw upstream shapes. Only the fields actually read are declared. */
interface RawParty {
  address?: string;
  owner?: string;
  owner_type?: string;
}

interface RawTx {
  id?: string;
  hash?: string;
  blockchain?: string;
  symbol?: string;
  transaction_type?: string;
  timestamp?: number;
  amount?: number;
  amount_usd?: number;
  from?: RawParty;
  to?: RawParty;
}

interface RawResponse {
  result?: string;
  message?: string;
  transactions?: RawTx[];
}

/** One normalised transfer, ready to become a `whale_events` row. */
export interface WhaleTx {
  /** Upstream id, or the tx hash. Primary key — this is what makes upsert idempotent. */
  id: string;
  /** Seconds since epoch. */
  ts: number;
  blockchain: string;
  symbol: string;
  amount: number;
  amountUsd: number;
  fromLabel: string;
  toLabel: string;
  kind: FlowKind;
  bias: FlowBias;
  impact: number;
  txUrl: string | null;
}

/**
 * Explorer link per chain. Chains absent here get `null` rather than a guessed
 * URL — a link that 404s is worse than no link.
 */
const EXPLORER: Record<string, (hash: string) => string> = {
  bitcoin: (h) => `https://blockstream.info/tx/${h}`,
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  tron: (h) => `https://tronscan.org/#/transaction/${h}`,
  ripple: (h) => `https://xrpscan.com/tx/${h}`,
  solana: (h) => `https://solscan.io/tx/${h}`,
  binancechain: (h) => `https://bscscan.com/tx/${h}`,
  polygon: (h) => `https://polygonscan.com/tx/${h}`,
  avalanche: (h) => `https://snowtrace.io/tx/${h}`,
  arbitrum: (h) => `https://arbiscan.io/tx/${h}`,
};

const isExchange = (p: RawParty | undefined) => p?.owner_type === 'exchange';

/**
 * Label a counterparty. Whale Alert names the entity when it knows one and
 * leaves `owner` empty when it does not — an unnamed side is genuinely unknown,
 * so it is labelled as such rather than given the raw address, which reads as
 * noise in a wire.
 */
function labelOf(p: RawParty | undefined): string {
  const owner = p?.owner?.trim();
  if (owner) return owner;
  const type = p?.owner_type?.trim();
  if (type && type !== 'unknown') return type;
  return 'Unknown wallet';
}

/**
 * Direction from the two `owner_type` fields. Same thesis as `classifyTx` —
 * coins moving toward a trading surface are supply about to hit the book —
 * applied to a source that hands us the labels instead of making us derive them
 * from a UTXO graph.
 */
function kindOf(tx: RawTx): FlowKind {
  const fromEx = isExchange(tx.from);
  const toEx = isExchange(tx.to);
  if (!fromEx && toEx) return 'EXCHANGE_INFLOW';
  if (fromEx && !toEx) return 'EXCHANGE_OUTFLOW';
  if (fromEx && toEx) return 'INTER_EXCHANGE';
  return 'WALLET_TRANSFER';
}

/**
 * Raw upstream row -> `WhaleTx`, or `null` when the row is unusable.
 *
 * Dropped: anything that is not a `transfer` (stablecoin `mint` / `burn` are
 * real signals but a different kind of event, and forcing them into the flow
 * vocabulary would misrepresent them), and rows missing a timestamp, an amount
 * or a USD value, which cannot be ordered or scored.
 *
 * Exported for testing — the normalisation is the part worth pinning down.
 */
export function normalizeWhaleTx(tx: RawTx): WhaleTx | null {
  if (tx.transaction_type && tx.transaction_type !== 'transfer') return null;

  const ts = Number(tx.timestamp);
  const amountUsd = Number(tx.amount_usd);
  const amount = Number(tx.amount);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const hash = tx.hash?.trim() ?? '';
  const id = tx.id?.trim() || hash;
  if (!id) return null;

  const blockchain = tx.blockchain?.trim().toLowerCase() || 'unknown';
  const kind = kindOf(tx);

  return {
    id,
    ts,
    blockchain,
    symbol: (tx.symbol?.trim() || '???').toUpperCase(),
    amount,
    amountUsd,
    fromLabel: labelOf(tx.from),
    toLabel: labelOf(tx.to),
    kind,
    bias: BIAS_BY_FLOW_KIND[kind],
    impact: usdImpact(amountUsd),
    txUrl: hash ? (EXPLORER[blockchain]?.(hash) ?? null) : null,
  };
}

/**
 * Recent large transfers across every chain Whale Alert covers.
 *
 * `lookbackSec` is clamped to `MAX_LOOKBACK_SEC` — see the constant. `now` is
 * injectable so a test can pin the window without touching the clock.
 */
export async function getWhaleTransactions(
  lookbackSec = MAX_LOOKBACK_SEC,
  now: number = Date.now(),
): Promise<WhaleTx[]> {
  const k = key();
  const window = Math.min(Math.max(60, lookbackSec), MAX_LOOKBACK_SEC);
  const start = Math.floor(now / 1000) - window;

  const url =
    `${BASE}/transactions?api_key=${encodeURIComponent(k)}` +
    `&min_value=${MIN_VALUE_USD}&start=${start}&limit=100`;

  // 60s: the ingestion cron runs every 5 minutes, so this only ever dedupes a
  // manual double-trigger. It has to stay well under the cron period, or a run
  // would replay the previous run's cached page.
  const j = await fetchJson<RawResponse>(url, { revalidate: 60 });

  // A 200 carrying `result: 'error'` is how this API reports a bad key or a
  // window outside the plan. Treating it as success would write an empty batch
  // and read as "no whales moved".
  if (j.result && j.result !== 'success') {
    throw new Error(`whale-alert: ${j.message ?? j.result}`);
  }

  const out: WhaleTx[] = [];
  for (const raw of j.transactions ?? []) {
    const n = normalizeWhaleTx(raw);
    if (n) out.push(n);
  }
  return out.sort((a, b) => b.ts - a.ts);
}
