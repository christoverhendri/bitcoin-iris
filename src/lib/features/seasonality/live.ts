/**
 * Live monthly-return seasonality over BTC's whole daily history (Coin Metrics,
 * from July 2010 — the same cached series as the halving-cycle and power-law
 * pages). Each cell is close-to-close: the month's last close over the previous
 * month's last close. The running month is month-to-date, flagged `partial`
 * and kept out of the summary rows; a new month's first close starts its cell
 * and finalises the one before, with nobody editing anything.
 */
import { loadCloses } from '@/lib/features/halvingCycle/inputs';
import { buildMonthlyCells } from './stats';
import type { SeasonalityArgs } from './types';

export async function fetchSeasonality(_args: SeasonalityArgs) {
  void _args;
  const closes = await loadCloses();
  if (!closes) return null;
  const cells = buildMonthlyCells(closes.series);
  if (cells.length < 12) return null;
  return { data: cells, asOf: closes.asOf, synthetic: false };
}
