/**
 * Halving dates read from the chain: the timestamp of the block at every
 * 210,000-block height at or below the current tip. A halving that happened
 * never changes, so each block is cached for 30 days. When the 1,050,000th
 * block is mined the fifth halving appears here by itself.
 *
 * mempool.space (height -> hash -> block) first, blockchain.info as fallback,
 * and the tested `HALVINGS_FALLBACK` list only if neither answers.
 * Docs: https://mempool.space/docs/api/rest · https://www.blockchain.com/explorer/api/blockchain_api
 */
import { HALVING_INTERVAL, HALVINGS_FALLBACK } from '@/lib/quant/config';
import { fetchJson, fetchText } from './http';

const MONTH = 30 * 86_400;

export interface Halving {
  height: number;
  /** UTC date of the block. */
  date: string;
  /** Block time, epoch seconds (`null` for a fallback entry). */
  ts: number | null;
}

export async function getBlockTimestamp(height: number): Promise<number> {
  try {
    const hash = (await fetchText(`https://mempool.space/api/block-height/${height}`, { revalidate: MONTH })).trim();
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`mempool block-height ${height}: not a hash`);
    const b = await fetchJson<{ timestamp?: number }>(`https://mempool.space/api/block/${hash}`, { revalidate: MONTH });
    if (!Number.isInteger(b?.timestamp)) throw new Error(`mempool block ${height}: no timestamp`);
    return b.timestamp!;
  } catch (err) {
    const j = await fetchJson<{ blocks?: { time?: number; main_chain?: boolean }[] }>(
      `https://blockchain.info/block-height/${height}?format=json`,
      { revalidate: MONTH, timeoutMs: 15_000 },
    );
    const b = j?.blocks?.find((x) => x.main_chain !== false);
    if (!Number.isInteger(b?.time)) throw new Error(`block ${height}: ${err instanceof Error ? err.message : err}; blockchain.info had no time`);
    return b!.time!;
  }
}

/** Every halving up to `tipHeight`, oldest first. */
export async function getHalvings(tipHeight: number): Promise<Halving[]> {
  const heights: number[] = [];
  for (let h = HALVING_INTERVAL; h <= tipHeight; h += HALVING_INTERVAL) heights.push(h);
  return Promise.all(
    heights.map(async (height) => {
      try {
        const ts = await getBlockTimestamp(height);
        return { height, date: new Date(ts * 1000).toISOString().slice(0, 10), ts };
      } catch (err) {
        const known = HALVINGS_FALLBACK.find((h) => h.height === height);
        if (!known) throw err;
        console.warn(`[halvings] using the fallback date for block ${height}:`, err instanceof Error ? err.message : err);
        return { height, date: known.date, ts: null };
      }
    }),
  );
}

/** Live average block time over the current difficulty epoch, in minutes (mempool.space `timeAvg`). */
export async function getAverageBlockMinutes(): Promise<number> {
  const j = await fetchJson<{ timeAvg?: number }>('https://mempool.space/api/v1/difficulty-adjustment', { revalidate: 600 });
  const ms = Number(j?.timeAvg);
  if (!Number.isFinite(ms) || ms < 60_000 || ms > 3_600_000) throw new Error('difficulty-adjustment: bad timeAvg');
  return ms / 60_000;
}
