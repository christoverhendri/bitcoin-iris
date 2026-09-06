/**
 * Arkham Intelligence — DORMANT until `ARKHAM_API_KEY` is set.
 *
 * The DIY path (`sources/esplora.ts` + `onchain/exchangeRegistry.ts`) sees only a
 * curated subset of exchange addresses and, without a database, has no history.
 * Arkham solves both: `/flow/entity` returns real historical netflow per labelled
 * entity, and `/transfers` returns whale movements already attributed to named
 * counterparties.
 *
 * Every function here throws when the key is missing. That is the intended
 * behaviour — `defineFeature` catches it and falls back to the DIY/mock path with
 * an unlock note, exactly like `sources/fred.ts`.
 *
 * API shape (verified 2026-09-03 against https://api.arkm.com/x402/openapi.json):
 * - Base `https://api.arkm.com/x402`, 92 endpoints, all POST with a JSON body.
 * - Auth: `SIGN-IN-WITH-X` header (SIWX), or x402 pay-per-request at $0.20/credit.
 * - Rate limits: 100 req/s most endpoints; 5 req/s for the heavy ones used here
 *   (`transfers`, `flow`, `counterparties`).
 *
 * Signing up gives a key; the x402 route additionally needs a funded wallet and
 * EIP-712 signing, which is deliberately NOT implemented here.
 */
import { fetchJson } from './http';

const BASE = 'https://api.arkm.com/x402';

function key(): string {
  const k = process.env.ARKHAM_API_KEY;
  if (!k) throw new Error('ARKHAM_API_KEY not set — Arkham path is dormant');
  return k;
}

async function post<T>(path: string, body: Record<string, unknown>, revalidate: number): Promise<T> {
  const k = key();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'SIGN-IN-WITH-X': k,
      'user-agent': 'iris-terminal/1.0',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`arkham ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** True when the key is present. Panels use this to decide the unlock note. */
export const isArkhamEnabled = (): boolean => Boolean(process.env.ARKHAM_API_KEY);

export interface ArkhamFlowPoint {
  time: string;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
}

/**
 * Historical USD flow for a labelled entity (e.g. `binance`, `coinbase`),
 * optionally scoped to one chain. This is the piece the DIY registry cannot
 * reproduce — real netflow history rather than a point-in-time snapshot.
 */
export async function getEntityFlow(
  entity: string,
  chains = 'bitcoin',
): Promise<ArkhamFlowPoint[]> {
  const j = await post<{ flows?: ArkhamFlowPoint[] }>(
    '/flow/entity',
    { entity, chains },
    900,
  );
  return j.flows ?? [];
}

export interface ArkhamTransfer {
  txid: string;
  blockTimestamp: string;
  unitValue: number;
  usdValue: number;
  fromLabel: string;
  toLabel: string;
}

/** Large transfers with entity attribution. Heavy endpoint — keep `limit` small. */
export async function getTransfers(limit = 20, chains = 'bitcoin'): Promise<ArkhamTransfer[]> {
  const j = await post<{ transfers?: ArkhamTransfer[] }>(
    '/transfers',
    { chains, limit, sortKey: 'time', sortDir: 'desc' },
    600,
  );
  return j.transfers ?? [];
}

/** Balance movements for a named entity — the labelled version of hot/cold drift. */
export async function getEntityBalanceChanges(entity: string): Promise<unknown> {
  return post('/intelligence/entity-balance-changes', { entity }, 900);
}

/** Summary statistics for an entity (holdings, counterparty count, etc.). */
export async function getEntitySummary(entity: string): Promise<unknown> {
  return post('/intelligence/entity-summary', { entity }, 3600);
}
