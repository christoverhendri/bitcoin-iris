import { fmtAgo, fmtCompact } from '@/lib/format';
import { impactTier, IMPACT_TIER_COLOR } from '@/lib/features/geopoliticalEvents/present';
import {
  BIAS_COLOR,
  BIAS_WORD,
  FLOW_KIND_COLOR,
  FLOW_KIND_LABEL,
} from '@/lib/onchain/classifyFlow';
import type { ChainFlowsData, FlowTransfer } from './types';

/** All values are already BTC — `fmtCompact` with no currency prefix. */
export function toChainFlowsLabels(f: ChainFlowsData) {
  return {
    inflow: `${fmtCompact(f.inflow, '')} BTC`,
    outflow: `${fmtCompact(f.outflow, '')} BTC`,
    cumulative: `${fmtCompact(f.cumulative, '')} BTC`,
  };
}

/**
 * Sign -> colour for a value where positive is the bullish direction (e.g. net
 * withdrawals). Netflow is the other way round, so callers pass its negation.
 */
export function getChainFlowsColor(value: number): string {
  if (value > 0) return 'var(--up)';
  if (value < 0) return 'var(--down)';
  return 'var(--mut)';
}

/** Flattened, display-ready fields for one transfer row on the flow radar. */
export function toFlowTransferRow(t: FlowTransfer, now?: number) {
  const tier = impactTier(t.impact);
  return {
    txid: t.txid,
    short: `${t.txid.slice(0, 8)}…`,
    ago: t.blockTime > 0 ? fmtAgo(new Date(t.blockTime * 1000).toISOString(), now) : 'PENDING',
    amount: `${fmtCompact(t.amountBtc, '')} BTC`,
    kind: t.kind,
    kindLabel: FLOW_KIND_LABEL[t.kind],
    kindColor: FLOW_KIND_COLOR[t.kind],
    bias: t.bias,
    biasWord: BIAS_WORD[t.bias],
    biasColor: BIAS_COLOR[t.bias],
    exchange: t.exchange,
    route: `${t.fromLabel} → ${t.toLabel}`,
    impact: Math.round(t.impact),
    tier,
    tierColor: IMPACT_TIER_COLOR[tier],
  };
}
