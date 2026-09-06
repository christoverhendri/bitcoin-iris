/**
 * Blockchair — keyless Bitcoin chain statistics.
 *
 * Deliberately a supplement, not a second source of truth. Blockchair returns
 * about forty fields and most of them duplicate something already read from
 * mempool.space (difficulty, hashrate, mempool size) or blockchain.info
 * (supply). Duplicating those here would mean two numbers for the same thing
 * that disagree by a few minutes, which is worse than one.
 *
 * Only three fields are taken, and each is one nothing else provides:
 *   - `volume_24h`  transferred value, the honest replacement for the
 *                   fabricated `newAddresses` figure this file was added to kill
 *   - `blocks_24h`  blocks found in a day; below ~144 the network is running
 *                   slow for the current difficulty
 *   - `cdd_24h`     coin days destroyed — old coins moving, the classic signal
 *                   that long-term holders are transacting
 *
 * Free tier is roughly 1440 requests/day across everything, so the revalidate
 * window is long and every caller shares this one reader.
 *
 * Docs: https://blockchair.com/api/docs
 */
import { fetchJson } from './http';

const URL = 'https://api.blockchair.com/bitcoin/stats';

/** One hour. The values here are daily aggregates; refetching faster is waste. */
const REVALIDATE = 3600;

export interface BlockchairStats {
  /** BTC transferred on-chain in the last 24h. */
  volume24hBtc: number;
  /** Blocks found in the last 24h. The long-run expectation is 144. */
  blocks24h: number;
  /** Coin days destroyed in the last 24h. */
  cdd24h: number;
  /** Mean transaction fee in USD over the last 24h. */
  avgFeeUsd24h: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getChainStats(): Promise<BlockchairStats> {
  const j = await fetchJson<{ data?: Record<string, unknown> }>(URL, { revalidate: REVALIDATE });
  const d = j?.data;
  if (!d || typeof d !== 'object') throw new Error('blockchair: missing data object');

  // `volume_24h` is denominated in satoshis.
  const volume24hBtc = num(d.volume_24h) / 1e8;

  // One sanity floor: a zero volume would mean the chain saw no transfers for a
  // day, which has never happened. Treat it as a bad payload rather than
  // rendering it as a measurement.
  if (volume24hBtc <= 0) throw new Error('blockchair: volume_24h is zero or unparseable');

  return {
    volume24hBtc,
    blocks24h: num(d.blocks_24h),
    cdd24h: num(d.cdd_24h),
    avgFeeUsd24h: num(d.average_transaction_fee_usd_24h),
  };
}
