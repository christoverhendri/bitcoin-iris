/**
 * Turns a raw Bitcoin transaction into a directional market signal.
 *
 * The thesis, in one line: **coins moving toward an exchange's trading surface
 * are supply about to hit the book; coins moving away from it are supply leaving
 * the market.** Everything below is that idea made mechanical.
 *
 *   deposit into any tracked wallet   -> EXCHANGE_INFLOW   bearish
 *   withdrawal out of a tracked wallet-> EXCHANGE_OUTFLOW  bullish
 *   cold -> hot, same exchange        -> HOT_LOADING       bearish
 *   hot  -> cold, same exchange       -> COLD_STORING      bullish
 *   exchange A -> exchange B          -> INTER_EXCHANGE    neutral
 *
 * HOT_LOADING is the sharpest of the five. An exchange topping up its hot wallet
 * from cold storage is pre-positioning liquidity it expects to need — it is the
 * one movement that is deliberate rather than customer-driven.
 *
 * This classifier only sees the addresses in `exchangeRegistry`. Anything it
 * calls "not tracked" may still be an exchange address we simply do not know
 * about, which is why a transfer is a signal and never a measurement.
 */
import type { EsploraTx } from '@/lib/sources/esplora';
import { lookupAddress, type ExchangeAddress } from './exchangeRegistry';

export type FlowKind =
  | 'EXCHANGE_INFLOW'
  | 'EXCHANGE_OUTFLOW'
  | 'HOT_LOADING'
  | 'COLD_STORING'
  | 'INTER_EXCHANGE'
  /**
   * Neither side is an exchange — one large wallet paying another. `classifyTx`
   * never returns this: the Esplora path only sees transactions that touch the
   * registry. It exists for the Whale Alert path, which reports whale-to-whale
   * movement the registry cannot see at all.
   */
  | 'WALLET_TRANSFER';

export type FlowBias = 'bullish' | 'bearish' | 'neutral';

export interface ClassifiedFlow {
  txid: string;
  /** Seconds since epoch; `0` for an unconfirmed mempool transfer. */
  blockTime: number;
  /** Net BTC crossing the tracked boundary — not the transaction's total value. */
  amountBtc: number;
  kind: FlowKind;
  bias: FlowBias;
  exchange: string;
  fromLabel: string;
  toLabel: string;
  /** 0-100 attention score. See IMPACT_* below. */
  impact: number;
}

export const FLOW_KIND_LABEL: Record<FlowKind, string> = {
  EXCHANGE_INFLOW: 'EXCHANGE INFLOW',
  EXCHANGE_OUTFLOW: 'EXCHANGE OUTFLOW',
  HOT_LOADING: 'HOT LOADING',
  COLD_STORING: 'COLD STORING',
  INTER_EXCHANGE: 'INTER-EXCHANGE',
  WALLET_TRANSFER: 'WALLET TRANSFER',
};

/** Bearish kinds red, bullish green, neutral muted. Theme tokens only. */
export const FLOW_KIND_COLOR: Record<FlowKind, string> = {
  EXCHANGE_INFLOW: 'var(--down)',
  HOT_LOADING: 'var(--down)',
  EXCHANGE_OUTFLOW: 'var(--up)',
  COLD_STORING: 'var(--up)',
  INTER_EXCHANGE: 'var(--mut)',
  WALLET_TRANSFER: 'var(--blue)',
};

const BIAS_BY_KIND: Record<FlowKind, FlowBias> = {
  EXCHANGE_INFLOW: 'bearish',
  HOT_LOADING: 'bearish',
  EXCHANGE_OUTFLOW: 'bullish',
  COLD_STORING: 'bullish',
  INTER_EXCHANGE: 'neutral',
  WALLET_TRANSFER: 'neutral',
};

/** Kind -> bias, shared by every classifier. */
export const BIAS_BY_FLOW_KIND: Record<FlowKind, FlowBias> = BIAS_BY_KIND;

/**
 * Impact curve.
 *
 * A linear `amount / 2000 * 100` would score a real 50 BTC move (~$5M) at 2,
 * which reads as noise when it is not. So the curve is a floor plus a linear
 * ramp: anything that clears the reporting threshold starts at IMPACT_FLOOR and
 * climbs to 100 at IMPACT_SATURATION BTC.
 *
 *   50 BTC -> 20      500 BTC -> 38      2000 BTC -> 84      2500+ BTC -> 100
 *
 * The floor is what stops the tier chips from marking every mid-size move LOW;
 * the saturation point is roughly where a single transfer stops being one desk's
 * decision and becomes an exchange-level treasury operation.
 */
const IMPACT_FLOOR = 20;
const IMPACT_SATURATION_BTC = 2_500;

export function flowImpact(amountBtc: number): number {
  const ramp = Math.min(1, Math.max(0, amountBtc) / IMPACT_SATURATION_BTC);
  return Math.min(100, Math.round(IMPACT_FLOOR + ramp * (100 - IMPACT_FLOOR)));
}

/**
 * The same curve for a multi-chain transfer, scored in USD instead of BTC.
 *
 * A linear ramp cannot work here: the reportable range spans three orders of
 * magnitude ($500K to $500M+), so linear would score every transfer under $50M
 * as noise. The ramp is therefore logarithmic between the floor and saturation:
 *
 *   $500K -> 20      $5M -> 47      $50M -> 73      $500M+ -> 100
 *
 * Below `IMPACT_FLOOR_USD` the score is 0 — a transfer that small is not a whale
 * movement and should not have been fetched in the first place.
 */
const IMPACT_FLOOR_USD = 500_000;
const IMPACT_SATURATION_USD = 500_000_000;
const USD_LOG_SPAN = Math.log(IMPACT_SATURATION_USD / IMPACT_FLOOR_USD);

export function usdImpact(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd < IMPACT_FLOOR_USD) return 0;
  const ramp = Math.min(1, Math.log(amountUsd / IMPACT_FLOOR_USD) / USD_LOG_SPAN);
  return Math.min(100, Math.round(IMPACT_FLOOR + ramp * (100 - IMPACT_FLOOR)));
}

interface Side {
  /** Registry hits, deduped by address, with the BTC they contributed. */
  tracked: { entry: ExchangeAddress; valueBtc: number }[];
  trackedBtc: number;
  untrackedBtc: number;
}

function sideOf(ios: { address: string | null; valueBtc: number }[]): Side {
  const tracked: Side['tracked'] = [];
  let trackedBtc = 0;
  let untrackedBtc = 0;
  for (const io of ios) {
    const entry = io.address ? lookupAddress(io.address) : undefined;
    if (entry) {
      tracked.push({ entry, valueBtc: io.valueBtc });
      trackedBtc += io.valueBtc;
    } else {
      untrackedBtc += io.valueBtc;
    }
  }
  return { tracked, trackedBtc, untrackedBtc };
}

const uniq = (xs: string[]) => [...new Set(xs)];

function labelOf(side: Side, fallback: string): string {
  const labels = uniq(side.tracked.map((t) => t.entry.label));
  if (labels.length === 0) return fallback;
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1}`;
}

function kindsOf(side: Side) {
  return new Set(side.tracked.map((t) => t.entry.kind));
}

/**
 * Classify one transaction, or return `null` if it carries no usable signal.
 *
 * `null` when: nothing on either side is tracked, both sides are the same wallet
 * (an internal consolidation is not a flow), or the net amount crossing the
 * tracked boundary is below `minBtc`.
 */
export function classifyTx(tx: EsploraTx, minBtc: number): ClassifiedFlow | null {
  const inp = sideOf(tx.vin);
  const outp = sideOf(tx.vout);

  const inTracked = inp.tracked.length > 0;
  const outTracked = outp.tracked.length > 0;
  if (!inTracked && !outTracked) return null;

  const inExchanges = uniq(inp.tracked.map((t) => t.entry.exchange));
  const outExchanges = uniq(outp.tracked.map((t) => t.entry.exchange));
  const inKinds = kindsOf(inp);
  const outKinds = kindsOf(outp);

  let kind: FlowKind;
  let amountBtc: number;
  let exchange: string;

  if (!inTracked && outTracked) {
    // Coins arriving from outside our view into a wallet we watch: a deposit.
    kind = 'EXCHANGE_INFLOW';
    amountBtc = outp.trackedBtc;
    exchange = outExchanges[0];
  } else if (inTracked && !outTracked) {
    // Coins leaving a watched wallet for an address we do not know. Subtracting
    // untracked change is not possible here — every output is untracked — so the
    // full outbound value is the flow.
    kind = 'EXCHANGE_OUTFLOW';
    amountBtc = outp.untrackedBtc;
    exchange = inExchanges[0];
  } else {
    // Both sides tracked. Same-exchange internal moves carry the sharpest
    // signal; cross-exchange ones carry none.
    const sameExchange =
      inExchanges.length === 1 && outExchanges.length === 1 && inExchanges[0] === outExchanges[0];

    if (!sameExchange) {
      kind = 'INTER_EXCHANGE';
      amountBtc = outp.trackedBtc;
      exchange = `${inExchanges[0]} -> ${outExchanges[0]}`;
    } else {
      exchange = inExchanges[0];
      // Only count the value landing on a wallet of the *other* kind — change
      // returning to the source wallet is not a flow.
      const toHot = outp.tracked
        .filter((t) => t.entry.kind === 'hot' || t.entry.kind === 'deposit')
        .reduce((s, t) => s + t.valueBtc, 0);
      const toCold = outp.tracked
        .filter((t) => t.entry.kind === 'cold')
        .reduce((s, t) => s + t.valueBtc, 0);

      if (inKinds.has('cold') && !inKinds.has('hot') && toHot > 0) {
        // Liquidity being staged on the trading surface.
        kind = 'HOT_LOADING';
        amountBtc = toHot;
      } else if (inKinds.has('hot') && !inKinds.has('cold') && toCold > 0) {
        // Balance parked out of reach of the order book.
        kind = 'COLD_STORING';
        amountBtc = toCold;
      } else {
        // Same exchange, same wallet class — a consolidation, not a flow.
        return null;
      }
    }
  }

  if (!Number.isFinite(amountBtc) || amountBtc < minBtc) return null;

  const fallbackFrom = kind === 'EXCHANGE_INFLOW' ? 'External wallet' : 'Unknown';
  const fallbackTo = kind === 'EXCHANGE_OUTFLOW' ? 'External wallet' : 'Unknown';

  return {
    txid: tx.txid,
    blockTime: tx.blockTime,
    amountBtc,
    kind,
    bias: BIAS_BY_KIND[kind],
    exchange,
    fromLabel: labelOf(inp, fallbackFrom),
    toLabel: labelOf(outp, fallbackTo),
    impact: flowImpact(amountBtc),
  };
}

/** Display word for a bias, matching the events wire vocabulary. */
export const BIAS_WORD: Record<FlowBias, string> = {
  bullish: 'BULLISH',
  bearish: 'BEARISH',
  neutral: 'NEUTRAL',
};

export const BIAS_COLOR: Record<FlowBias, string> = {
  bullish: 'var(--up)',
  bearish: 'var(--down)',
  neutral: 'var(--mut)',
};
