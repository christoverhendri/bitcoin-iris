/**
 * Plain-language words and small helpers for the monthly forecast page. Pure,
 * so client components may import it. The page follows the Forecast-tab
 * curation (2026-10-18): simple percentile names, no model-state or
 * probability-above tables; the full backtest stays in the worker's output.
 */
import type { BacktestHorizon, BacktestMethod, DailyBand, MonthlyForecastData } from './types';

/** Percentile columns in plain words (Forecast curation, 2026-10-18). */
export const RANGE_COLS: { key: 'p5' | 'p25' | 'p50' | 'p75' | 'p95'; label: string; title: string }[] = [
  { key: 'p5', label: 'SANGAT RENDAH', title: 'Hanya 5 dari 100 jalur simulasi berakhir di bawah harga ini' },
  { key: 'p25', label: 'RENDAH', title: '25 dari 100 jalur berakhir di bawah harga ini' },
  { key: 'p50', label: 'TENGAH', title: 'Separuh jalur di bawah, separuh di atas' },
  { key: 'p75', label: 'TINGGI', title: '25 dari 100 jalur berakhir di atas harga ini' },
  { key: 'p95', label: 'SANGAT TINGGI', title: 'Hanya 5 dari 100 jalur berakhir di atas harga ini' },
];

/** Days ahead shown in the range table. */
export const LADDER_STEPS = [1, 7, 14, 21, 30];

export const ladderRows = (d: MonthlyForecastData): DailyBand[] =>
  LADDER_STEPS.filter((s) => s < d.bands.length).map((s) => d.bands[s]);

export const pctVsSpot = (price: number, spot: number) => (spot > 0 ? ((price - spot) / spot) * 100 : 0);

export const fmtSignedPct = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;

export const fmtPctOrDash = (v: number | null, digits = 0) =>
  v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;

/** Which backtest row is the engine behind the published bands. */
export function shippedMethod(runMethod: string): BacktestMethod['method'] {
  if (runMethod.endsWith('_cal')) return 'fhs_cal';
  return runMethod.startsWith('fhs_dvol') ? 'fhs_dvol' : 'fhs';
}

/** The shipped engine's backtest row at each horizon (7 / 14 / 30 days). */
export function shippedScores(d: MonthlyForecastData): { h: BacktestHorizon; m: BacktestMethod }[] {
  const ship = shippedMethod(d.method);
  return (d.backtest?.horizons ?? [])
    .map((h) => ({ h, m: h.methods.find((x) => x.method === ship) }))
    .filter((x): x is { h: BacktestHorizon; m: BacktestMethod } => !!x.m);
}

export type Tone = 'up' | 'amber' | 'down';

/** Aggregate coverage: within 5 points of nominal reads as calibrated, 5–10 a warning. */
export function coverageTone(empirical: number, nominalPct: number): Tone {
  const gap = Math.abs(empirical * 100 - nominalPct);
  return gap <= 5 ? 'up' : gap <= 10 ? 'amber' : 'down';
}

/** Where a realised close landed, in words. */
export const BUCKET_WORD: Record<string, string> = {
  '<p5': 'di bawah sangat rendah',
  'p5-p10': 'rendah sekali',
  'p10-p25': 'rendah',
  'p25-p50': 'sedikit di bawah tengah',
  'p50-p75': 'sedikit di atas tengah',
  'p75-p90': 'tinggi',
  'p90-p95': 'tinggi sekali',
  '>p95': 'di atas sangat tinggi',
};

/** Next Monday 00:20 UTC after `iso` — when the worker is scheduled to run again. */
export function nextScheduledRun(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 20));
  do next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() !== 1);
  return next.toISOString().slice(0, 10);
}
