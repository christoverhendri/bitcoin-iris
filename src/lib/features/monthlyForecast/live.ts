/**
 * Monthly forecast, read from what Timothy's worker wrote (motmots/iris-monthly-forecast).
 *
 * Nothing is computed here. The Python worker (`worker/iris_worker/monthly/`)
 * runs the simulation and the backtest once a week on a schedule and writes one
 * row per run; this file reads the newest row plus every run's scored outcomes
 * for the forward-validation series. Supabase (`monthly_forecast_runs`) first; without Supabase, the
 * JSON files a local `--dry-run` writes to `MONTHLY_LOCAL_DIR` (same row shape).
 * Unconfigured or empty resolves to `null` and the page hides its panels.
 *
 * `asOf` is the end of the as-of close's day (the data date), not the run time,
 * so a schedule that stops shows as STALE after `MAX_AGE_SEC.monthlyForecast`.
 */
import { asRow, getSupabase } from '@/lib/supabase/server';
import { monthlyForward, type HorizonOutcome, type MonthlyRunOutcome } from '@/lib/forward/stats';
import type {
  BacktestHorizon,
  DailyBand,
  MonthlyBacktest,
  MonthlyForecastArgs,
  MonthlyForecastData,
  ProbabilityRow,
} from './types';

interface RunRow {
  id: string;
  run_at: string;
  as_of: string;
  spot: number | string;
  horizon_days: number;
  n_paths: number;
  method: string;
  price_source: string;
  sample_days: number;
  history_start: string;
  model: Record<string, unknown>;
  bands: DailyBand[];
  paths: number[][];
  history: { date: string; close: number }[];
  backtest: Record<string, unknown> | null;
  realized: Record<string, unknown> | null;
  is_synthetic: boolean;
}

const LATEST_COLUMNS =
  'id, run_at, as_of, spot, horizon_days, n_paths, method, price_source, sample_days, history_start, model, bands, paths, history, backtest, realized, is_synthetic';

/** Postgres `numeric` arrives as a string through PostgREST. */
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};

const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : num(v, NaN);

function toModel(m: Record<string, unknown>): MonthlyForecastData['model'] {
  const probs = Array.isArray(m.probabilities) ? (m.probabilities as Record<string, unknown>[]) : [];
  return {
    engine: String(m.engine ?? 'FHS'),
    volModel: m.method === 'ewma' ? 'ewma' : 'garch',
    alpha: num(m.alpha),
    beta: num(m.beta),
    persistence: num(m.persistence),
    sigmaNowAnnPct: num(m.sigma_now_ann_pct),
    sigmaLongRunAnnPct: num(m.sigma_long_run_ann_pct),
    driftRemovedDaily: num(m.drift_removed_daily),
    expectedMovePct: num(m.expected_move_pct),
    rangeP5P95Pct: num(m.range_p5_p95_pct),
    volSource: m.vol_source === 'dvol_vrp' ? 'dvol_vrp' : 'garch',
    sigmaGarchAnnPct: num(m.sigma_garch_ann_pct, num(m.sigma_now_ann_pct)),
    dvolPct: numOrNull(m.dvol_pct),
    vrpFactor: numOrNull(m.vrp_factor),
    calibrationApplied: Boolean((m.calibration as Record<string, unknown> | undefined)?.applied),
    calibrationNote: (() => {
      const c = m.calibration as Record<string, unknown> | undefined;
      return typeof c?.reason === 'string' ? c.reason : null;
    })(),
    probabilities: probs.map(
      (p): ProbabilityRow => ({
        label: String(p.label),
        price: num(p.price),
        probAbove: num(p.prob_above),
      }),
    ),
  };
}

function toBacktest(b: Record<string, unknown> | null): MonthlyBacktest | null {
  if (!b || !Array.isArray(b.horizons)) return null;
  const years = (v: unknown) =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((y) => ({
      year: String(y.year),
      coverage: num(y.coverage),
      origins: num(y.origins),
    }));
  const horizons = (b.horizons as Record<string, unknown>[]).map((h) => ({
    h: num(h.h),
    origins: num(h.origins),
    independent: num(h.independent),
    naiveMape: numOrNull(h.naive_mape),
    methods: (Array.isArray(h.methods) ? (h.methods as Record<string, unknown>[]) : []).map((m) => ({
      method: m.method as BacktestHorizon['methods'][number]['method'],
      label: String(m.label ?? m.method),
      coverage: m.coverage as BacktestHorizon['methods'][number]['coverage'],
      pinball: num(m.pinball),
      pit: Array.isArray(m.pit) ? (m.pit as number[]) : [],
      upperMiss: numOrNull(m.upper_miss),
      lowerMiss: numOrNull(m.lower_miss),
      mapeMedian: numOrNull(m.mape_median),
      width80Pct: numOrNull(m.width80_pct),
    })),
  }));
  return {
    origins: num(b.origins),
    warmupOrigins: num(b.warmup_origins),
    firstOrigin: String(b.first_origin ?? ''),
    lastOrigin: String(b.last_origin ?? ''),
    stepDays: num(b.step_days, 7),
    refitEveryDays: num(b.refit_every_days, 365),
    horizons,
    byYear: years(b.fhs_coverage80_by_year_h30),
    byYearCal: years(b.fhs_cal_coverage80_by_year_h30),
    byYearDvol: years(b.fhs_dvol_coverage80_by_year_h30),
    dvolUsed: Boolean(b.dvol_used),
  };
}

/** Local mode: `monthly_forecast_<as-of>.json` files, newest first. */
async function readLocalRuns(limit: number): Promise<RunRow[] | null> {
  const dir = process.env.MONTHLY_LOCAL_DIR;
  if (!dir) return null;
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const base = resolve(/* turbopackIgnore: true */ process.cwd(), dir);
    const names = (await readdir(/* turbopackIgnore: true */ base))
      .filter((n) => /^monthly_forecast_\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .sort()
      .reverse()
      .slice(0, limit);
    const rows = await Promise.all(
      names.map(async (n) => JSON.parse(await readFile(/* turbopackIgnore: true */ resolve(base, n), 'utf8')) as RunRow),
    );
    return rows.filter((r) => r && typeof r.as_of === 'string');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[monthlyForecast:local]', err);
    return null;
  }
}

const endOfDay = (isoDate: string) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + 86_400_000).toISOString();

/** Every run's per-horizon outcomes (`realized.at_h`, scored by later runs) for the forward series. */
function toOutcome(r: Pick<RunRow, 'as_of' | 'realized'>): MonthlyRunOutcome {
  const atH = (r.realized?.at_h ?? {}) as Record<string, HorizonOutcome | undefined>;
  return { asOf: r.as_of, atH };
}

/** Upper bound on runs read for the forward series (10 years of weekly runs). */
const MAX_RUNS = 520;

export async function fetchMonthlyForecast(_args: MonthlyForecastArgs) {
  void _args;
  const db = getSupabase();
  if (!db) {
    const runs = (await readLocalRuns(MAX_RUNS)) ?? [];
    const latest = runs[0];
    if (!latest || !Array.isArray(latest.bands) || latest.bands.length < 2) return null;
    return { data: toData(latest, runs.map(toOutcome)), asOf: endOfDay(latest.as_of), synthetic: latest.is_synthetic };
  }

  const { data, error } = await db
    .from('monthly_forecast_runs')
    .select(LATEST_COLUMNS)
    .order('as_of', { ascending: false })
    .limit(1);
  if (error) throw new Error(`monthly_forecast_runs: ${error.message}`);

  const latest = data?.[0] ? asRow<RunRow>(data[0]) : null;
  if (!latest || !Array.isArray(latest.bands) || latest.bands.length < 2) return null;

  // The forward series is a garnish on the page; losing it must not cost the chart.
  const { data: all, error: allError } = await db
    .from('monthly_forecast_runs')
    .select('as_of, realized')
    .order('as_of', { ascending: true })
    .limit(MAX_RUNS);
  const outcomes = allError ? [] : (all ?? []).map((r) => toOutcome(asRow<Pick<RunRow, 'as_of' | 'realized'>>(r)));
  return { data: toData(latest, outcomes), asOf: endOfDay(latest.as_of), synthetic: latest.is_synthetic };
}

function toData(latest: RunRow, outcomes: MonthlyRunOutcome[]): MonthlyForecastData {
  const result: MonthlyForecastData = {
    runId: latest.id,
    runAt: latest.run_at,
    asOf: latest.as_of,
    spot: num(latest.spot),
    horizonDays: latest.horizon_days,
    nPaths: latest.n_paths,
    method: latest.method,
    priceSource: latest.price_source,
    sampleDays: latest.sample_days,
    historyStart: latest.history_start,
    bands: latest.bands.map((b) => ({
      step: b.step,
      date: b.date,
      p5: num(b.p5),
      p10: num(b.p10),
      p25: num(b.p25),
      p50: num(b.p50),
      p75: num(b.p75),
      p90: num(b.p90),
      p95: num(b.p95),
    })),
    paths: Array.isArray(latest.paths) ? latest.paths : [],
    history: Array.isArray(latest.history) ? latest.history : [],
    model: toModel(latest.model ?? {}),
    backtest: toBacktest(latest.backtest),
    forward: monthlyForward(outcomes),
  };
  return result;
}
