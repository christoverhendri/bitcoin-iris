import type {
  DifficultyAdjustment,
  FeeBucket,
  HashratePoint,
  MempoolFees,
  MiningPool,
} from '@/lib/sources/mempool';

/**
 * Bitcoin network conditions: what it costs to transact, how congested the
 * backlog is, and how mining is doing.
 *
 * The sub-shapes are re-exported from the source rather than redeclared. They
 * are already the normalised form — a second copy here would be two definitions
 * of one thing, drifting apart at the first upstream change.
 */
export interface ChainNetworkData {
  fees: MempoolFees;

  mempool: {
    txCount: number;
    vsize: number;
    blocksToClear: number;
    buckets: FeeBucket[];
  };

  difficulty: DifficultyAdjustment;

  hashrate: {
    points: HashratePoint[];
    currentEhs: number;
    currentDifficulty: number;
    /** Change over the series window, in percent. Signed. */
    changePct: number;
  };

  pools: MiningPool[];

  /**
   * Blocks found in the last 24h, from Blockchair. `null` when that call
   * failed — the rest of the panel does not depend on it, and a zero would read
   * as a measurement.
   */
  blocks24h: number | null;
  /** Mean transaction fee in USD over 24h, from Blockchair. `null` when absent. */
  avgFeeUsd24h: number | null;
}

export interface ChainNetworkArgs {
  symbol?: string;
}

export type { DifficultyAdjustment, FeeBucket, HashratePoint, MempoolFees, MiningPool };
