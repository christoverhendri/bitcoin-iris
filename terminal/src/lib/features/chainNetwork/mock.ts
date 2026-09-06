import { seeded, between, intBetween, utcDay } from '@/lib/rng';
import type { ChainNetworkArgs, ChainNetworkData, HashratePoint, MiningPool } from './types';

/**
 * PLACEHOLDER — shown only when mempool.space is unreachable.
 *
 * Same shape as the live payload, so no component carries a mock branch.
 *
 * Deterministic by construction: the only clock it reads is the UTC date, via
 * `seeded` / `utcDay`. No `Math.random`, no `Date.now` — SSR and hydration must
 * produce byte-identical output.
 */

/** Pool names only; the block counts below are invented, the names are not. */
const POOL_NAMES = [
  'Foundry USA',
  'AntPool',
  'ViaBTC',
  'F2Pool',
  'MARA Pool',
  'Binance Pool',
  'SpiderPool',
  'Luxor',
  'Unknown',
];

const DAY_MS = 86_400_000;

export function mockChainNetwork({ symbol = 'BTC' }: ChainNetworkArgs): ChainNetworkData {
  const r = seeded(`chain_network_${symbol}`);

  // Midnight UTC today — a stable anchor for the synthetic timeline, in place of
  // a clock read.
  const dayStartMs = Date.parse(`${utcDay()}T00:00:00.000Z`);

  const economy = intBetween(r, 1, 3);
  const fees = {
    fastest: economy + intBetween(r, 1, 6),
    halfHour: economy + intBetween(r, 0, 3),
    hour: economy + intBetween(r, 0, 1),
    economy,
    minimum: 1,
  };

  const buckets = [
    { from: 0, to: 2, label: '<2' },
    { from: 2, to: 4, label: '2-4' },
    { from: 4, to: 8, label: '4-8' },
    { from: 8, to: 15, label: '8-15' },
    { from: 15, to: 30, label: '15-30' },
    { from: 30, to: 60, label: '30-60' },
    { from: 60, to: null, label: '60+' },
  ].map((b, i) => ({
    ...b,
    // Front-loaded: most pending weight sits in the cheap bands most of the time.
    vsize: Math.round(between(r, 200_000, 12_000_000) / (i + 1)),
  }));

  const vsize = buckets.reduce((s, b) => s + b.vsize, 0);

  // 90 daily points, matching the live series window.
  const days = 90;
  const startEhs = between(r, 700, 800);
  const points: HashratePoint[] = [];
  for (let i = 0; i < days; i++) {
    const trend = (i / days) * between(r, 40, 140);
    const noise = between(r, -45, 45);
    points.push({
      ts: dayStartMs - (days - 1 - i) * DAY_MS,
      ehs: Math.max(1, startEhs + trend + noise),
    });
  }
  const first = points[0].ehs;
  const last = points[points.length - 1].ehs;

  const totalBlocks = intBetween(r, 950, 1080);
  let remaining = totalBlocks;
  const pools: MiningPool[] = POOL_NAMES.map((name, i) => {
    const isLast = i === POOL_NAMES.length - 1;
    const share = isLast ? remaining : Math.round(remaining * between(r, 0.18, 0.36));
    remaining = Math.max(0, remaining - share);
    return {
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      link: null,
      blockCount: share,
      sharePct: (share / totalBlocks) * 100,
    };
  })
    .filter((p) => p.blockCount > 0)
    .sort((a, b) => b.blockCount - a.blockCount);

  const remainingBlocks = intBetween(r, 40, 1900);

  return {
    fees,
    mempool: {
      txCount: intBetween(r, 8_000, 180_000),
      vsize,
      blocksToClear: vsize / 1_000_000,
      buckets,
    },
    difficulty: {
      progressPct: ((2016 - remainingBlocks) / 2016) * 100,
      changePct: between(r, -4, 5),
      previousChangePct: between(r, -4, 5),
      remainingBlocks,
      remainingMs: remainingBlocks * 600_000,
      estimatedRetargetAt: new Date(dayStartMs + remainingBlocks * 600_000).toISOString(),
      nextRetargetHeight: 966_000 + intBetween(r, 0, 2000),
      blockTimeAvgSec: between(r, 540, 660),
    },
    hashrate: {
      points,
      currentEhs: last,
      currentDifficulty: between(r, 1.1e14, 1.4e14),
      changePct: ((last - first) / first) * 100,
    },
    pools,
    blocks24h: intBetween(r, 130, 158),
    avgFeeUsd24h: between(r, 0.2, 4),
  };
}
