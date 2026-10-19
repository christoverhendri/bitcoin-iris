/**
 * Every constant the Quant pages use, in one place (IRIS_koreksi_auto_compute.md §0).
 *
 * Two kinds only:
 *   1. Bitcoin protocol facts that never change.
 *   2. Method parameters — definitions, not data. Changing one changes what a
 *      word means ("top", "zone"), so they are listed on the page's
 *      methodology note rather than buried in code.
 * No observed value (a price, a date that happened or will happen) belongs here,
 * with one tested exception: the past halving dates, kept as a fallback for when
 * no block API answers (`halvings.test.ts` checks them against block timestamps).
 */

// --- 1. Protocol facts --------------------------------------------------------
export const GENESIS = '2009-01-03';
export const HALVING_INTERVAL = 210_000;
export const TARGET_BLOCK_MINUTES = 10;

/** Fallback only. The live list comes from the block timestamps at each 210,000-block height. */
export const HALVINGS_FALLBACK: readonly { height: number; date: string }[] = [
  { height: 210_000, date: '2012-11-28' },
  { height: 420_000, date: '2016-07-09' },
  { height: 630_000, date: '2020-05-11' },
  { height: 840_000, date: '2024-04-20' },
];

// --- 2. Method parameters -----------------------------------------------------
/** A peak is a FINAL top when price then falls ≥ 60% and later makes a new high. */
export const MAJOR_TOP_DRAWDOWN = 0.6;
/** The running cycle's highest close is a PROVISIONAL top once price is ≥ 40% below it. */
export const TOP_CONFIRM_DRAWDOWN = 0.4;
/** A bottom is CONFIRMED once price has risen ≥ +100% from it without a lower close. */
export const BOTTOM_CONFIRM_RISE = 1.0;
/** > 1 widens every interval to allow for the pattern changing. */
export const SCALE_INFLATE = 1.0;
export const EXCLUDE_FIRST_CYCLE = false;
/** Shown range: 80%. The 95% range is computed for the "outside the pattern" flag only. */
export const SHOWN_RANGE = [0.1, 0.9] as const;
export const OUTER_RANGE = [0.025, 0.975] as const;
/** Chained projection (bottom before a top exists): deterministic Monte Carlo. */
export const CHAIN_SAMPLES = 20_000;
export const CHAIN_SEED = 20_090_103;

/** Power-law walk-forward starts here (needs ~1.5 years of warm-up data); also where the Quant charts begin. */
export const PL_WF_START = '2012-01-01';
export const QUANTS = [0.05, 0.25, 0.5, 0.75, 0.95] as const;
/** Zone edges on the 0–100 corridor percentile. */
export const ZONE_EDGES = [10, 30, 70, 90] as const;
