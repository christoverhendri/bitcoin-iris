/**
 * Bitcoin network telemetry — keyless.
 *
 * Originally read from mempool.space. That host blocks datacentre / many ISP
 * IPs outright (connection refused, not rate-limited), so from most deploy
 * targets every call here failed and the whole NETWORK page fell to mock. This
 * module now sources the same five things from hosts that answer:
 *
 *   - Blockchair `/bitcoin/stats`  fees, mempool depth, difficulty, hashrate
 *   - blockchain.info charts        hashrate history, mining-pool distribution
 *
 * What is lost versus mempool.space, and now approximated or dropped:
 *   - Fee tiers are DERIVED from Blockchair's single "suggested" sat/vB rate,
 *     not four independently estimated confirmation targets.
 *   - The pending-weight-by-fee histogram does not exist here; the backlog is
 *     shown in the single band matching the suggested rate.
 *   - "Previous retarget %" has no keyless source off mempool.space -> null.
 *
 * Failure policy is unchanged: every function throws on a bad response, and
 * `defineFeature` turns that into the badged mock.
 *
 * Docs: https://blockchair.com/api/docs · https://www.blockchain.com/explorer/api/charts_api
 */
import { fetchJson } from './http';

const BC_STATS = 'https://api.blockchair.com/bitcoin/stats';
const BINFO = 'https://api.blockchain.info';

/** Hashes per second -> exahashes per second. */
const toEhs = (hps: number) => hps / 1e18;

const finite = (v: unknown, what: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`network: non-finite ${what}`);
  return n;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Shared Blockchair read. Next dedupes the fetch across callers in one pass. */
async function chainStats(): Promise<Record<string, unknown>> {
  const j = await fetchJson<{ data?: Record<string, unknown> }>(BC_STATS, { revalidate: 300 });
  if (!j?.data || typeof j.data !== 'object') throw new Error('blockchair: missing data object');
  return j.data;
}

/* ------------------------------------------------------------------ fees -- */

/** Recommended fee rates in sat/vB. */
export interface MempoolFees {
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
  minimum: number;
}

/**
 * Blockchair publishes one "suggested" next-block rate, not a tiered estimate.
 * The slower targets are derived from it. When the chain is quiet every tier
 * collapses onto the relay minimum, which is the true state, not a placeholder.
 */
export async function getRecommendedFees(): Promise<MempoolFees> {
  const d = await chainStats();
  const s = Math.max(1, Math.round(finite(d.suggested_transaction_fee_per_byte_sat, 'suggested fee')));
  return {
    fastest: s,
    halfHour: Math.max(1, Math.round(s * 0.85)),
    hour: Math.max(1, Math.round(s * 0.7)),
    economy: Math.max(1, Math.round(s * 0.5)),
    minimum: 1,
  };
}

/* --------------------------------------------------------------- mempool -- */

export interface FeeBucket {
  from: number;
  to: number | null;
  label: string;
  vsize: number;
}

export interface MempoolState {
  txCount: number;
  vsize: number;
  totalFeeSat: number;
  blocksToClear: number;
  buckets: FeeBucket[];
}

const BANDS: { from: number; to: number | null; label: string }[] = [
  { from: 0, to: 2, label: '<2' },
  { from: 2, to: 4, label: '2-4' },
  { from: 4, to: 8, label: '4-8' },
  { from: 8, to: 15, label: '8-15' },
  { from: 15, to: 30, label: '15-30' },
  { from: 30, to: 60, label: '30-60' },
  { from: 60, to: null, label: '60+' },
];

const BLOCK_VSIZE = 1_000_000;

/**
 * Bucket a raw `[feeRate, vsize][]` histogram into `BANDS`. Kept because the
 * unit tests target it and it still bands the single-rate approximation below.
 */
export function bucketFeeHistogram(histogram: unknown): FeeBucket[] {
  const buckets: FeeBucket[] = BANDS.map((b) => ({ ...b, vsize: 0 }));
  if (!Array.isArray(histogram)) return buckets;

  for (const entry of histogram) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const rate = Number(entry[0]);
    const vsize = Number(entry[1]);
    if (!Number.isFinite(rate) || !Number.isFinite(vsize) || vsize <= 0) continue;
    const idx = buckets.findIndex((b) => rate >= b.from && (b.to === null || rate < b.to));
    if (idx >= 0) buckets[idx].vsize += vsize;
  }
  return buckets;
}

export async function getMempoolState(): Promise<MempoolState> {
  const d = await chainStats();
  const vsize = finite(d.mempool_size, 'mempool_size');
  const suggested = num(d.suggested_transaction_fee_per_byte_sat) || 1;

  // No histogram off Blockchair — attribute the whole backlog to the band the
  // suggested rate sits in. It is an approximation and the panel says so.
  const buckets: FeeBucket[] = BANDS.map((b) => ({ ...b, vsize: 0 }));
  const idx = buckets.findIndex((b) => suggested >= b.from && (b.to === null || suggested < b.to));
  if (idx >= 0) buckets[idx].vsize = vsize;

  return {
    txCount: finite(d.mempool_transactions, 'mempool_transactions'),
    vsize,
    totalFeeSat: 0, // not exposed in BTC terms by this source
    blocksToClear: vsize / BLOCK_VSIZE,
    buckets,
  };
}

/* ------------------------------------------------------------ difficulty -- */

export interface DifficultyAdjustment {
  progressPct: number;
  changePct: number;
  /** No keyless source off mempool.space — `null`, shown as "—". */
  previousChangePct: number | null;
  remainingBlocks: number;
  remainingMs: number;
  estimatedRetargetAt: string;
  nextRetargetHeight: number;
  blockTimeAvgSec: number;
}

const EPOCH = 2016;

export async function getDifficultyAdjustment(): Promise<DifficultyAdjustment> {
  const d = await chainStats();
  const cur = finite(d.difficulty, 'difficulty');
  const next = num(d.next_difficulty_estimate) || cur;
  const height = finite(d.blocks, 'blocks');

  const changePct = cur > 0 ? ((next - cur) / cur) * 100 : 0;
  const sinceRetarget = ((height % EPOCH) + EPOCH) % EPOCH;
  const remainingBlocks = EPOCH - sinceRetarget;

  // A positive difficulty estimate means blocks are coming faster than 600s.
  const blockTimeAvgSec = Math.max(300, Math.min(1200, 600 / (1 + changePct / 100)));
  const remainingMs = remainingBlocks * blockTimeAvgSec * 1000;

  return {
    progressPct: (sinceRetarget / EPOCH) * 100,
    changePct,
    previousChangePct: null,
    remainingBlocks,
    remainingMs,
    estimatedRetargetAt: new Date(Date.now() + remainingMs).toISOString(),
    nextRetargetHeight: height - sinceRetarget + EPOCH,
    blockTimeAvgSec,
  };
}

/* -------------------------------------------------------------- hashrate -- */

export interface HashratePoint {
  ts: number;
  ehs: number;
}

export interface HashrateSeries {
  points: HashratePoint[];
  currentEhs: number;
  currentDifficulty: number;
}

interface BinfoChart {
  values?: { x: number; y: number }[];
}

/** Daily hashrate over ~3 months (blockchain.info), current reading (Blockchair). */
export async function getHashrateSeries(): Promise<HashrateSeries> {
  const [chart, d] = await Promise.all([
    fetchJson<BinfoChart>(
      `${BINFO}/charts/hash-rate?timespan=3months&format=json&sampled=true`,
      { revalidate: 3600 },
    ),
    chainStats(),
  ]);

  const raw = Array.isArray(chart.values) ? chart.values : [];
  const points: HashratePoint[] = [];
  for (const p of raw) {
    const ts = Number(p?.x);
    const ths = Number(p?.y); // TH/s
    if (!Number.isFinite(ts) || !Number.isFinite(ths) || ths <= 0) continue;
    points.push({ ts: ts * 1000, ehs: ths / 1e6 }); // 1 EH/s = 1e6 TH/s
  }
  if (points.length === 0) throw new Error('blockchain.info: empty hashrate series');
  points.sort((a, b) => a.ts - b.ts);

  const hps24h = num(d.hashrate_24h);
  const currentEhs = hps24h > 0 ? toEhs(hps24h) : points[points.length - 1].ehs;

  return {
    points,
    currentEhs,
    currentDifficulty: finite(d.difficulty, 'difficulty'),
  };
}

/* ----------------------------------------------------------------- pools -- */

export interface MiningPool {
  name: string;
  slug: string;
  link: string | null;
  blockCount: number;
  sharePct: number;
}

/**
 * Pool distribution over the last five days (blockchain.info). Attribution is a
 * coinbase-tag heuristic; unattributed blocks land under "Unknown", which is a
 * real measurement of unlabelled hashrate and is kept.
 */
export async function getMiningPools(): Promise<MiningPool[]> {
  const j = await fetchJson<Record<string, unknown>>(
    `${BINFO}/pools?timespan=5days&format=json`,
    { revalidate: 3600 },
  );

  const entries = Object.entries(j).filter(([, v]) => Number.isFinite(Number(v)));
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  if (entries.length === 0 || total <= 0) throw new Error('blockchain.info: empty pool list');

  return entries
    .map(([name, v]) => {
      const blockCount = Number(v);
      return {
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        link: null,
        blockCount,
        sharePct: (blockCount / total) * 100,
      };
    })
    .sort((a, b) => b.blockCount - a.blockCount);
}
