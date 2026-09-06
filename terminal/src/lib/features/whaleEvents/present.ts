import { fmtAgo, fmtCompact } from '@/lib/format';
import { impactTier, IMPACT_TIER_COLOR } from '@/lib/features/geopoliticalEvents/present';
import {
  BIAS_COLOR,
  BIAS_WORD,
  FLOW_KIND_COLOR,
  FLOW_KIND_LABEL,
} from '@/lib/onchain/classifyFlow';
import type { WhaleEvent } from './types';

/**
 * Amount in asset units. `fmtCompact` with no prefix, plus the ticker — a
 * stablecoin transfer reads `24.00M USDT`, not `$24.00M`, so the USD column
 * beside it stays the one dollar figure on the row.
 */
export const fmtAmount = (e: WhaleEvent) => `${fmtCompact(e.amount, '')} ${e.symbol}`;

/** Flattened, display-ready fields for one wire row. */
export function toWhaleEventRow(e: WhaleEvent, now?: number) {
  const tier = impactTier(e.impact);
  return {
    id: e.id,
    ago: fmtAgo(e.ts, now),
    amount: fmtAmount(e),
    usd: fmtCompact(e.amountUsd),
    chain: e.blockchain.toUpperCase(),
    kindLabel: FLOW_KIND_LABEL[e.kind],
    kindColor: FLOW_KIND_COLOR[e.kind],
    biasWord: BIAS_WORD[e.bias],
    biasColor: BIAS_COLOR[e.bias],
    route: `${e.fromLabel} → ${e.toLabel}`,
    impact: Math.round(e.impact),
    tier,
    tierColor: IMPACT_TIER_COLOR[tier],
    txUrl: e.txUrl,
  };
}

export interface WhaleFlowSummary {
  inflowUsd: number;
  outflowUsd: number;
  /** `inflow - outflow`. Positive = net deposits = sell pressure. */
  netUsd: number;
  inflowCount: number;
  outflowCount: number;
  /** Events inside the window. */
  count: number;
}

const HOUR_MS = 3_600_000;

/**
 * Directional totals over the last `hours` of the feed.
 *
 * The window is measured from the newest event, not from the wall clock. That
 * keeps the number stable between SSR and hydration, and it is also the honest
 * reading: with a stalled ingestion, "24h from now" would silently empty the
 * cell while "24h from the last thing we saw" keeps showing what was seen.
 *
 * `INTER_EXCHANGE` and `WALLET_TRANSFER` are counted in `count` but contribute
 * to neither side — neither one changes how much supply sits on an order book.
 */
export function summarizeWhaleFlow(events: WhaleEvent[], hours = 24): WhaleFlowSummary {
  const empty: WhaleFlowSummary = {
    inflowUsd: 0,
    outflowUsd: 0,
    netUsd: 0,
    inflowCount: 0,
    outflowCount: 0,
    count: 0,
  };
  if (events.length === 0) return empty;

  const newest = events.reduce((m, e) => Math.max(m, Date.parse(e.ts) || 0), 0);
  const cutoff = newest - hours * HOUR_MS;

  const out = { ...empty };
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t) || t < cutoff) continue;
    out.count += 1;
    if (e.kind === 'EXCHANGE_INFLOW') {
      out.inflowUsd += e.amountUsd;
      out.inflowCount += 1;
    } else if (e.kind === 'EXCHANGE_OUTFLOW') {
      out.outflowUsd += e.amountUsd;
      out.outflowCount += 1;
    }
  }
  out.netUsd = out.inflowUsd - out.outflowUsd;
  return out;
}

/**
 * Colour for a net figure where **negative is bullish** — net withdrawals mean
 * supply leaving the book. Netflow is signed the other way from most series in
 * the terminal, so this is deliberately not `signTone`.
 */
export function netflowColor(netUsd: number): string {
  if (netUsd > 0) return 'var(--down)';
  if (netUsd < 0) return 'var(--up)';
  return 'var(--mut)';
}

export function netflowWord(netUsd: number): string {
  if (netUsd > 0) return 'NET INFLOW';
  if (netUsd < 0) return 'NET OUTFLOW';
  return 'BALANCED';
}
