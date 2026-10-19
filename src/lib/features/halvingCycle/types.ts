import type { CycleAnalysis } from '@/lib/quant/cycle';
import type { PriceSource } from '@/lib/sources/coinmetrics';

export interface HalvingCycleData {
  priceSource: PriceSource;
  /** Day of the newest close. */
  lastDate: string;
  priceNow: number;
  /** Server "today" (UTC), for countdowns. */
  today: string;
  /** Halving dates came from block timestamps (false = the tested fallback list). */
  halvingsFromChain: boolean;
  analysis: CycleAnalysis;
  /** Weekly closes for the cycle map (the last point is the newest close). */
  history: { date: string; price: number }[];
}

export type HalvingCycleArgs = Record<string, never>;
