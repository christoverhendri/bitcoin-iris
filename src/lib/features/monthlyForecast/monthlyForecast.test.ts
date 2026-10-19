import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageTone, nextScheduledRun, ladderRows, shippedMethod } from './present';

/**
 * The live reader is exercised against a hand-built PostgREST double, shaped
 * exactly like what `worker/iris_worker/monthly/forecast.py` writes (snake_case jsonb,
 * numeric columns as strings).
 */
const band = (step: number, spot: number) => ({
  step,
  date: `2026-08-${String(21 + step).padStart(2, '0')}`,
  p5: spot * 0.9,
  p10: spot * 0.93,
  p25: spot * 0.97,
  p50: spot,
  p75: spot * 1.03,
  p90: spot * 1.07,
  p95: spot * 1.1,
});

const latest = {
  id: '2026-08-21',
  run_at: '2026-08-24T00:20:00Z',
  as_of: '2026-08-21',
  spot: '63551.88',
  horizon_days: 2,
  n_paths: 10000,
  method: 'fhs',
  price_source: 'coinbase',
  sample_days: 4184,
  history_start: '2015-03-08',
  model: {
    engine: 'FHS',
    method: 'garch',
    alpha: 0.11,
    beta: 0.85,
    persistence: 0.96,
    sigma_now_ann_pct: 34.8,
    sigma_long_run_ann_pct: 65.8,
    drift_removed_daily: 0.0013,
    expected_move_pct: 8.3,
    range_p5_p95_pct: 44.9,
    probabilities: [{ label: '+10%', price: 69907, prob_above: 0.22 }],
  },
  bands: [band(0, 63551.88), band(1, 63551.88), band(2, 63551.88)],
  paths: [[63551.88, 63000, 62000]],
  history: [{ date: '2026-08-20', close: 63000 }, { date: '2026-08-21', close: 63551.88 }],
  backtest: {
    origins: 385,
    first_origin: '2019-03-07',
    last_origin: '2026-07-16',
    step_days: 7,
    refit_every_days: 365,
    horizons: [],
    fhs_coverage80_by_year_h30: [{ year: '2025', coverage: 0.94, origins: 52 }],
  },
  realized: { days_observed: 0 },
  is_synthetic: false,
};

const previous = {
  id: '2026-08-14',
  as_of: '2026-08-14',
  spot: '60000',
  bands: [band(0, 60000), band(1, 60000), band(2, 60000)],
  realized: {
    days_total: 2,
    days_observed: 2,
    complete: true,
    inside_p10_p90: 0.5,
    inside_p5_p95: 1,
    last_close: 66000,
    last_bucket: 'p90-p95',
    at_h: { '7': { date: '2026-08-21', close: 66000, inside80: false, inside90: true, bucket: 'p90-p95', abs_err_median: 0.1 } },
  },
};

function query(rows: unknown[]) {
  const q = {
    select: () => q,
    order: () => q,
    lt: () => q,
    limit: async () => ({ data: rows, error: null }),
  };
  return q;
}

let supabaseOn = true;
vi.mock('@/lib/supabase/server', () => ({
  asRow: <T,>(v: unknown) => v as T,
  getSupabase: () => {
    if (!supabaseOn) return null;
    let call = 0;
    return { from: () => query(call++ === 0 ? [latest] : [previous]) };
  },
}));


describe('fetchMonthlyForecast', () => {
  it('maps a worker row into the UI shape (Supabase)', async () => {
    supabaseOn = true;
    const { fetchMonthlyForecast } = await import('./live');
    const res = await fetchMonthlyForecast({});
    const d = res!.data;
    expect(d.spot).toBeCloseTo(63551.88);
    expect(d.bands).toHaveLength(3);
    expect(d.model.volSource).toBe('garch'); // fixture has no DVOL: the fallback
    expect(d.model.dvolPct).toBeNull();
    expect(d.backtest?.byYear[0].coverage).toBeCloseTo(0.94);
    // The forward series reads every stored run's per-horizon outcomes.
    expect(d.forward.runs).toBe(1);
    expect(d.forward.horizons.map((h) => h.h)).toEqual([7, 14, 28]);
    expect(d.forward.horizons[0].scored).toBe(1);
    expect(d.forward.horizons[0].inside80).toBe(0);
    expect(res!.synthetic).toBe(false);
    // Dated by the as-of close (end of that day), not by when the job ran.
    expect(res!.asOf).toBe('2026-08-22T00:00:00.000Z');
  });

  it('without Supabase reads the --dry-run files in MONTHLY_LOCAL_DIR, newest first', async () => {
    supabaseOn = false;
    const dir = mkdtempSync(join(tmpdir(), 'monthly-'));
    writeFileSync(join(dir, 'monthly_forecast_2026-08-21.json'), JSON.stringify(latest));
    writeFileSync(join(dir, 'monthly_forecast_2026-08-14.json'), JSON.stringify({ ...previous, run_at: '', horizon_days: 2, model: {}, paths: [], history: [] }));
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    vi.stubEnv('MONTHLY_LOCAL_DIR', dir);
    const { fetchMonthlyForecast } = await import('./live');
    const res = await fetchMonthlyForecast({});
    expect(res!.data.asOf).toBe('2026-08-21');
    expect(res!.data.forward.start).toBe('2026-08-14');
    expect(res!.data.forward.runs).toBe(2);
    vi.stubEnv('MONTHLY_LOCAL_DIR', join(dir, 'missing'));
    expect(await fetchMonthlyForecast({})).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe('present helpers', () => {
  it('tones aggregate coverage symmetrically around nominal', () => {
    expect(coverageTone(0.8, 80)).toBe('up');
    expect(coverageTone(0.72, 80)).toBe('amber');
    expect(coverageTone(0.95, 80)).toBe('down');
  });

  it('maps the run method to the backtest row behind the published bands', () => {
    expect(shippedMethod('fhs_dvol')).toBe('fhs_dvol');
    expect(shippedMethod('fhs')).toBe('fhs');
    expect(shippedMethod('fhs_dvol_cal')).toBe('fhs_cal');
  });

  it('schedules the next run for the following Monday', () => {
    expect(nextScheduledRun('2026-08-24T00:20:05Z')).toBe('2026-08-31');
    expect(nextScheduledRun('2026-08-26T10:00:00Z')).toBe('2026-08-31');
  });

  it('range rows stop at the horizon', () => {
    const d = { bands: Array.from({ length: 31 }, (_, step) => ({ step })) } as never;
    expect(ladderRows(d).map((b: { step: number }) => b.step)).toEqual([1, 7, 14, 21, 30]);
  });
});
