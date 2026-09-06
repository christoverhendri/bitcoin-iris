import { seeded, between, intBetween, pick, utcDay } from '@/lib/rng';
import { BIAS_BY_FLOW_KIND, usdImpact, type FlowKind } from '@/lib/onchain/classifyFlow';
import type { WhaleEvent, WhaleEventsArgs } from './types';

/**
 * PLACEHOLDER — shown until `/api/ingest/whale` has written rows.
 *
 * Same shape as the live payload, so no component carries a mock branch.
 *
 * Deterministic by construction: the only clock it reads is the UTC date, via
 * `seeded` / `utcDay`. No `Math.random`, no `Date.now` — the panel is a client
 * component, so SSR and hydration must produce byte-identical output.
 */

const KINDS: FlowKind[] = [
  'EXCHANGE_INFLOW',
  'EXCHANGE_OUTFLOW',
  'INTER_EXCHANGE',
  'WALLET_TRANSFER',
];

/** Chain, ticker, and a plausible unit price — enough to make USD and amount agree. */
const ASSETS: { blockchain: string; symbol: string; usdPerUnit: number }[] = [
  { blockchain: 'bitcoin', symbol: 'BTC', usdPerUnit: 100_000 },
  { blockchain: 'ethereum', symbol: 'ETH', usdPerUnit: 3_500 },
  { blockchain: 'ethereum', symbol: 'USDT', usdPerUnit: 1 },
  { blockchain: 'tron', symbol: 'USDT', usdPerUnit: 1 },
  { blockchain: 'ripple', symbol: 'XRP', usdPerUnit: 2.4 },
  { blockchain: 'solana', symbol: 'SOL', usdPerUnit: 180 },
];

const EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bitfinex', 'Bybit'];

export function mockWhaleEvents({ limit = 50 }: WhaleEventsArgs): WhaleEvent[] {
  const r = seeded('whale_events');

  // Midnight UTC today — a stable anchor for the synthetic timeline, in place of
  // a clock read.
  const dayStartMs = Date.parse(`${utcDay()}T00:00:00.000Z`);

  const count = Math.min(limit, intBetween(r, 18, 30));
  const events: WhaleEvent[] = [];

  for (let i = 0; i < count; i++) {
    const kind = pick(r, KINDS);
    const asset = pick(r, ASSETS);
    const exchange = pick(r, EXCHANGES);
    const other = pick(r, EXCHANGES);

    const amountUsd = Math.round(between(r, 600_000, 90_000_000));
    const amount = Math.round((amountUsd / asset.usdPerUnit) * 100) / 100;

    const wallet = 'Unknown wallet';
    const [fromLabel, toLabel] =
      kind === 'EXCHANGE_INFLOW'
        ? [wallet, exchange]
        : kind === 'EXCHANGE_OUTFLOW'
          ? [exchange, wallet]
          : kind === 'INTER_EXCHANGE'
            ? [exchange, other === exchange ? 'Coinbase' : other]
            : [wallet, wallet];

    events.push({
      id: `mock-${i.toString().padStart(3, '0')}`,
      // Spread across the day, newest first, without reading the clock.
      ts: new Date(dayStartMs + intBetween(r, 0, 82_800_000) - i * 600_000).toISOString(),
      blockchain: asset.blockchain,
      symbol: asset.symbol,
      amount,
      amountUsd,
      fromLabel,
      toLabel,
      kind,
      bias: BIAS_BY_FLOW_KIND[kind],
      impact: usdImpact(amountUsd),
      // No link: a fabricated hash would 404 on a real explorer.
      txUrl: null,
    });
  }

  return events.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}
