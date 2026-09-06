import { fmtCompact, fmtPct } from '@/lib/format';
import type { ChainNetworkData, FeeBucket, MiningPool } from './types';

/** `3 sat/vB`. Fee rates are small integers; compact notation would obscure them. */
export const fmtFeeRate = (satPerVb: number) => `${Math.round(satPerVb)} sat/vB`;

/**
 * Cheapest fee that still gets confirmed in the next block or two, versus the
 * floor. When these converge the mempool is empty and any fee works — which is
 * the single most useful thing a fee panel can tell you.
 */
export const isMempoolClear = (d: ChainNetworkData) => d.fees.fastest <= d.fees.minimum + 1;

/** `2.4 blocks` — backlog expressed the way miners and wallets think about it. */
export function fmtBacklog(blocksToClear: number): string {
  if (blocksToClear < 0.1) return 'empty';
  return `${blocksToClear.toFixed(1)} blocks`;
}

/**
 * Congestion tier from the backlog depth.
 *
 * Boundaries are hand-chosen, like every other threshold in this terminal: one
 * block of backlog is normal operation, six is roughly an hour of waiting, and
 * beyond twenty a low-fee transaction may sit for a day.
 */
export type CongestionTier = 'CLEAR' | 'NORMAL' | 'BUSY' | 'CONGESTED';

export function congestionTier(blocksToClear: number): CongestionTier {
  if (blocksToClear < 1) return 'CLEAR';
  if (blocksToClear < 6) return 'NORMAL';
  if (blocksToClear < 20) return 'BUSY';
  return 'CONGESTED';
}

export const CONGESTION_COLOR: Record<CongestionTier, string> = {
  CLEAR: 'var(--up)',
  NORMAL: 'var(--txt)',
  BUSY: 'var(--amber)',
  CONGESTED: 'var(--down)',
};

/** Bucket widths as percentages of total pending weight, for a stacked bar. */
export function bucketShares(buckets: FeeBucket[]): { label: string; pct: number; vsize: number }[] {
  const total = buckets.reduce((s, b) => s + b.vsize, 0);
  return buckets.map((b) => ({
    label: b.label,
    vsize: b.vsize,
    pct: total > 0 ? (b.vsize / total) * 100 : 0,
  }));
}

/**
 * Difficulty change colour.
 *
 * Rising difficulty is not "good" or "bad" for price — it means more hashrate
 * competing, which is a security positive and a miner-margin negative. Rendering
 * it green/red would assert a directional claim the number does not support, so
 * it stays neutral and only the sign is shown.
 */
export const fmtDifficultyChange = (pct: number | null) =>
  pct == null ? '—' : fmtPct(pct, true, 2);

/** `912.4 EH/s`. */
export const fmtHashrate = (ehs: number) => `${ehs.toFixed(1)} EH/s`;

/**
 * Block pace against the 144/day the protocol targets. Below that the chain is
 * running slow for the current difficulty; above it, fast.
 */
export const TARGET_BLOCKS_24H = 144;

export function blockPaceWord(blocks24h: number | null): string {
  if (blocks24h == null) return '—';
  if (blocks24h > TARGET_BLOCKS_24H + 6) return 'AHEAD';
  if (blocks24h < TARGET_BLOCKS_24H - 6) return 'BEHIND';
  return 'ON PACE';
}

/** Flattened, display-ready fields for one pool row. */
export function toPoolRow(p: MiningPool) {
  return {
    name: p.name,
    blocks: String(p.blockCount),
    share: `${p.sharePct.toFixed(1)}%`,
    sharePct: p.sharePct,
    link: p.link,
  };
}

/** `38.4M vB`. */
export const fmtVsize = (vsize: number) => `${fmtCompact(vsize, '')} vB`;
