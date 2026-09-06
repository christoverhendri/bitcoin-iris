/**
 * Live monthly-return seasonality — computed from real daily BTC candles.
 *
 * Kraken is the price source: keyless and up to ~720 daily candles (~2 years),
 * more history than Coinbase's 300-candle window. CoinGecko's 365-day daily
 * close series is the fallback.
 *
 * NOTE ON HISTORY: keyless sources only reach back ~2 years, so this emits
 * roughly 24 cells (one per calendar month present), not the multi-year grid the
 * mock fabricates. The panel's "LIMITED HISTORY" note is a component concern.
 *
 * Each cell's return is `(lastClose - firstClose) / firstClose * 100` across the
 * days that fall in that calendar month.
 */
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { getDailyCloses } from '@/lib/sources/coingecko';
import type { SeasonalityCell, SeasonalityArgs } from './types';

interface Close {
  ts: number; // unix seconds
  close: number;
}

export async function fetchSeasonality(_args: SeasonalityArgs) {
  void _args; // history is bounded by the source, not by the requested `years`

  let closes: Close[];
  try {
    const candles = await krakenCandles('1d', 'XBTUSD');
    closes = candles.map((c) => ({ ts: c.ts, close: c.close }));
    if (closes.length < 60) throw new Error('not enough kraken candles');
  } catch {
    closes = await getDailyCloses(365);
  }

  if (closes.length < 60) return null;
  closes.sort((a, b) => a.ts - b.ts);

  // Bucket closes by `year-month`, preserving day order within each bucket.
  const buckets = new Map<string, Close[]>();
  for (const c of closes) {
    const d = new Date(c.ts * 1000);
    const k = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    const arr = buckets.get(k);
    if (arr) arr.push(c);
    else buckets.set(k, [c]);
  }

  const cells: SeasonalityCell[] = [];
  for (const [k, arr] of buckets) {
    if (arr.length < 2) continue;
    const [yStr, mStr] = k.split('-');
    const first = arr[0].close;
    const last = arr[arr.length - 1].close;
    if (!Number.isFinite(first) || first === 0) continue;
    cells.push({
      year: Number(yStr),
      month: Number(mStr),
      returnPct: ((last - first) / first) * 100,
    });
  }

  if (cells.length < 3) return null;
  cells.sort((a, b) => a.year - b.year || a.month - b.month);

  const asOf = new Date(closes[closes.length - 1].ts * 1000).toISOString();
  return { data: cells, asOf, synthetic: false };
}
