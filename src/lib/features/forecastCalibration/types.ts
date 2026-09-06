import type { BootstrapMethod } from '@/lib/quant/fhs';

export type CoverageVerdict = 'GOOD' | 'NARROW' | 'WIDE';

export interface CoverageRow {
  /** The band's advertised coverage, e.g. 80 for P10–P90. */
  nominalPct: number;
  /** Share of historical outcomes that actually landed inside it. */
  empiricalPct: number;
  windows: number;
  verdict: CoverageVerdict;
}

export interface PitBin {
  binLow: number;
  binHigh: number;
  count: number;
  /** Count a perfectly calibrated model would put here. */
  expected: number;
}

export interface MethodScore {
  method: BootstrapMethod;
  label: string;
  coverage80: number;
  /** Mean pinball loss across the quantile ladder. Lower is sharper. */
  pinball: number;
}

export interface CalibrationData {
  horizonDays: number;
  horizonLabel: string;
  /** Out-of-sample origins evaluated. */
  origins: number;
  /** Returns used only to fit the model, never to score it. */
  trainDays: number;
  /** Returns the origins were drawn from. */
  testDays: number;

  coverage: CoverageRow[];
  pitHistogram: PitBin[];
  /** 0-100. 100 means the PIT histogram is perfectly flat. */
  pitUniformityScore: number;
  /** Plain-language reading of the histogram's shape. */
  pitShape: 'FLAT' | 'U-SHAPED' | 'HUMPED' | 'SKEWED';

  comparison: MethodScore[];
  /** Engine the coverage and PIT rows describe. */
  primaryMethod: BootstrapMethod;
}

export interface CalibrationArgs {
  horizonDays?: number;
  nPaths?: number;
}
