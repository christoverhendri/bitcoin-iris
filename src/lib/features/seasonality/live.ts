/**
 * Live monthly-return seasonality over BTC's whole Yahoo history (curation
 * 2026-10-18: "dari awal banget"). Yahoo's BTC-USD series starts 2014-09-17, so
 * the first full month is October 2014 — about twelve years.
 *
 * Each cell is that calendar month's return, `(close − open) / open × 100` from
 * the monthly bar. Yahoo appends the live month as a second bar stamped "now",
 * so bars are grouped by calendar month: open from the first, close from the
 * last. The running month is flagged `partial` and kept out of the odds.
 */
import { getMonthlyCandles } from '@/lib/sources/yahooCrypto';
import { buildCells } from './stats';
import type { SeasonalityArgs } from './types';

export async function fetchSeasonality(_args: SeasonalityArgs) {
  void _args;
  const bars = await getMonthlyCandles('BTC-USD');
  const now = new Date();
  const cells = buildCells(bars, { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
  if (cells.length < 12) return null;

  // The newest bar's own timestamp (Yahoo's live bar is stamped with the quote time).
  const asOf = new Date(bars[bars.length - 1].ts * 1000).toISOString();
  return { data: cells, asOf, synthetic: false };
}
