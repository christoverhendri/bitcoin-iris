import type { BootstrapMethod, DriftMode } from '@/lib/quant/fhs';

/** One horizon's slice of the same simulation. */
export interface HorizonBand {
  key: string;
  days: number;
  label: string;
  /** Absolute prices. */
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  /** Half the interquartile range, as a percentage of spot. */
  expectedMovePct: number;
  /** The p5-p95 span as a percentage of spot. */
  rangePct: number;
  /**
   * Independent samples of this horizon the history actually contains
   * (`sampleDays / days`). Rendered, never hidden: a one-year band drawn from a
   * decade rests on ten non-overlapping observations, and the reader is entitled
   * to know that before trusting it.
   */
  nonOverlappingWindows: number;
}

export interface HistogramBin {
  binLow: number;
  binHigh: number;
  count: number;
}

export interface ProbabilityLevel {
  price: number;
  label: string;
  /** Share of simulated paths at or above `price` at the selected horizon. */
  probAbove: number;
}

/** A point on the price history rendered to the left of the cone. */
export interface HistoryPoint {
  ts: number;
  close: number;
}

export interface PriceDistributionData {
  spot: number;
  horizonDays: number;
  horizonLabel: string;

  /** `bands[step][q]` — gross multiplier vs spot, step 0 through `horizonDays`. */
  bands: number[][];
  quantiles: number[];

  /** Recent actual closes, so the cone is anchored to something real. */
  history: HistoryPoint[];

  terminalHistogram: HistogramBin[];
  /** Always all six horizons, whichever one is selected. */
  termStructure: HorizonBand[];
  probabilityLevels: ProbabilityLevel[];

  /** Trading days of history the simulation drew from. */
  sampleDays: number;
  /** ISO date of the oldest close used. */
  historyStart: string;

  method: BootstrapMethod;
  driftMode: DriftMode;
  /** Mean daily log return removed before simulating. */
  driftRemoved: number;

  garchConverged: boolean;
  /** Daily sigma, as percentages, annualised for readability. */
  sigmaNowAnnualPct: number;
  sigmaLongRunAnnualPct: number;
  /** Deribit DVOL — the option market's own 30d forward vol. `null` when absent. */
  dvol: number | null;
}

export interface PriceDistributionArgs {
  /** Days ahead. Defaults to the 1M horizon. */
  horizonDays?: number;
  nPaths?: number;
}
