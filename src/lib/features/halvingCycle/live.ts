/**
 * Halving-cycle page data, recomputed on every revalidate from the close
 * series, the chain's halving blocks and the clock (`src/lib/quant/cycle.ts`).
 * Nothing here is typed in; the notebook's output is only a test fixture.
 */
import { analyzeCycles } from '@/lib/quant/cycle';
import { PL_WF_START } from '@/lib/quant/config';
import { isoDay } from '@/lib/quant/daily';
import { loadCycleInputs, weeklyIndices } from './inputs';
import type { HalvingCycleArgs, HalvingCycleData } from './types';

export async function fetchHalvingCycle(_args: HalvingCycleArgs) {
  void _args;
  const inputs = await loadCycleInputs();
  if (!inputs) return null;
  const { series, source, height, halvings, liveBlockMinutes, asOf } = inputs;
  const nowMs = Date.now();
  const analysis = analyzeCycles(series, { halvings, blockHeight: height, liveBlockMinutes, nowMs });
  if (!analysis.current) return null;

  const data: HalvingCycleData = {
    priceSource: source,
    lastDate: isoDay(series.start + series.prices.length - 1),
    priceNow: series.prices[series.prices.length - 1],
    today: isoDay(nowMs / 86_400_000),
    halvingsFromChain: halvings.every((h) => h.ts !== null),
    analysis,
    history: weeklyIndices(series, PL_WF_START).map((i) => ({ date: isoDay(series.start + i), price: series.prices[i] })),
  };
  return { data, asOf, synthetic: false };
}
