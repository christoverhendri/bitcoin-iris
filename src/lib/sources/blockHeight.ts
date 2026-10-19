/**
 * Current Bitcoin block height, for dating the next halving (block 1,050,000).
 * mempool.space first, blockchain.info as the fallback; both keyless plain text.
 */
import { fetchText } from './http';

const URLS = ['https://mempool.space/api/blocks/tip/height', 'https://blockchain.info/q/getblockcount'];

export async function getBlockHeight(): Promise<number> {
  const errors: string[] = [];
  for (const url of URLS) {
    try {
      const n = Number((await fetchText(url, { revalidate: 600 })).trim());
      if (Number.isInteger(n) && n > 800_000) return n;
      errors.push(`${url}: not a height`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`block height unavailable: ${errors.join('; ')}`);
}
