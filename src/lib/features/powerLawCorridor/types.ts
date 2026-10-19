import type { PowerLawFit, Zone } from '@/lib/quant/powerLaw';
import type { PriceSource } from '@/lib/sources/coinmetrics';

export interface PowerLawData {
  priceSource: PriceSource;
  lastDate: string;
  priceNow: number;
  /** Walk-forward percentile of the newest close, its zone, and today's band prices (p5…p95). */
  today: { pct: number; zone: Zone; bands: number[] };
  /** The newest monthly fit; every band on the page is drawn with it. */
  fit: PowerLawFit;
  /** The exponent b every four years and now, to show the line itself moves. */
  bHistory: { refit: string; b: number }[];
  /** Weekly points: close and that day's walk-forward percentile. */
  series: { date: string; price: number; pct: number }[];
}

export type PowerLawArgs = Record<string, never>;
