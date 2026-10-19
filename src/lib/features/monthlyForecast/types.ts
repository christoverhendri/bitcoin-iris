import type { MonthlyForward } from '@/lib/forward/stats';

/**
 * The monthly forecast as the Python worker writes it to
 * `public.monthly_forecast_runs` (see `worker/iris_worker/monthly/forecast.py`), reshaped
 * into camelCase for the UI. Prices are absolute USD throughout.
 */

export interface DailyBand {
  /** 0 = the as-of close; 1..horizon = days ahead. */
  step: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface ClosePoint {
  date: string;
  close: number;
}

export interface ProbabilityRow {
  label: string;
  price: number;
  /** Share of simulated paths at or above `price` on the final day. */
  probAbove: number;
}

export interface MonthlyModelState {
  engine: string;
  /** 'garch' when the fit converged, 'ewma' when it fell back. */
  volModel: 'garch' | 'ewma';
  alpha: number;
  beta: number;
  persistence: number;
  sigmaNowAnnPct: number;
  sigmaLongRunAnnPct: number;
  driftRemovedDaily: number;
  /** Half the P25–P75 span at the horizon, % of spot. */
  expectedMovePct: number;
  /** P5–P95 span at the horizon, % of spot. */
  rangeP5P95Pct: number;
  probabilities: ProbabilityRow[];
  /** Whether conformal recalibration was applied to the published bands. */
  calibrationApplied: boolean;
  calibrationNote: string | null;
  /** Where the paths' starting vol came from: Deribit DVOL x VRP, or GARCH (fallback). */
  volSource: 'dvol_vrp' | 'garch';
  /** GARCH conditional vol, annualised — what the start vol would be without DVOL. */
  sigmaGarchAnnPct: number;
  /** Raw DVOL at the as-of close (annualised %), null on the GARCH fallback. */
  dvolPct: number | null;
  /** Walk-forward realised/implied factor applied to DVOL, null on the fallback. */
  vrpFactor: number | null;
}

export interface BacktestMethod {
  method: 'fhs' | 'fhs_dvol' | 'fhs_cal' | 'iid' | 'garch_normal';
  label: string;
  /** Empirical coverage of the central 50 / 80 / 90 % bands, 0–1. */
  coverage: { '50': number; '80': number; '90': number };
  pinball: number;
  /** 10-bin PIT histogram counts. */
  pit: number[];
  /** Share of outcomes above P90 / below P10. */
  upperMiss: number | null;
  lowerMiss: number | null;
  /** Mean |median − actual| / actual, in price terms. Null on runs before this was recorded. */
  mapeMedian: number | null;
  /** Mean P10–P90 width as a share of spot. */
  width80Pct: number | null;
}

export interface BacktestHorizon {
  h: number;
  origins: number;
  /** Non-overlapping windows — what the sample size really is. */
  independent: number;
  /** MAPE of the naive “price stays where it is” forecast, for reference. */
  naiveMape: number | null;
  methods: BacktestMethod[];
}

export interface MonthlyBacktest {
  origins: number;
  /** Early origins excluded so every engine is scored on the same set. */
  warmupOrigins: number;
  firstOrigin: string;
  lastOrigin: string;
  stepDays: number;
  refitEveryDays: number;
  horizons: BacktestHorizon[];
  byYear: { year: string; coverage: number; origins: number }[];
  /** Same, for the recalibrated variant that was evaluated but not shipped. */
  byYearCal: { year: string; coverage: number; origins: number }[];
  /** Same, for FHS + DVOL; empty when the run had no DVOL. */
  byYearDvol: { year: string; coverage: number; origins: number }[];
  /** Whether the backtest included the DVOL engine (scored on DVOL-era origins). */
  dvolUsed: boolean;
}

export interface MonthlyForecastData {
  runId: string;
  runAt: string;
  asOf: string;
  spot: number;
  horizonDays: number;
  nPaths: number;
  method: string;
  priceSource: string;
  sampleDays: number;
  historyStart: string;
  bands: DailyBand[];
  /** Representative simulated paths, each `horizonDays + 1` prices long. */
  paths: number[][];
  history: ClosePoint[];
  model: MonthlyModelState;
  backtest: MonthlyBacktest | null;
  /** Forward validation: non-overlapping series at D+7 / D+14 / D+28 over every stored run. */
  forward: MonthlyForward;
}

export type MonthlyForecastArgs = Record<string, never>;
