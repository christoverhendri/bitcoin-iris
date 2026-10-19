-- Monthly Monte Carlo forecast runs, written weekly by the Python worker
-- (worker/iris_worker/monthly/, scheduled in .github/workflows/monthly-forecast.yml and the local APScheduler job `monthly`).
--
-- One row per run, keyed by the as-of date (the last completed UTC daily close).
-- A retried or duplicated schedule upserts the same row instead of adding one.
-- Older rows are kept on purpose: each run's `realized` column is re-scored by
-- later runs, which is what turns the table into a live out-of-sample record.
--
-- Apply with: supabase db push, or paste into the SQL editor.

create table if not exists public.monthly_forecast_runs (
  id              text        primary key,          -- = as_of, yyyy-mm-dd
  run_at          timestamptz not null default now(),
  as_of           date        not null,
  spot            numeric     not null,
  horizon_days    int         not null,
  n_paths         int         not null,
  method          text        not null,             -- 'fhs' | 'iid'
  drift_mode      text        not null,             -- 'zero' | 'none'
  price_source    text        not null,             -- coinbase | kraken | csv
  sample_days     int         not null,
  history_start   date        not null,
  -- GARCH state, volatility, probabilities. Shape: see worker/iris_worker/monthly/forecast.py
  model           jsonb       not null,
  -- [{step, date, p5, p10, p25, p50, p75, p90, p95}], step 0 = as_of (all = spot)
  bands           jsonb       not null,
  -- ~24 representative simulated price paths, each horizon_days + 1 long
  paths           jsonb       not null,
  -- [{date, close}] actual closes before as_of, for anchoring the chart
  history         jsonb       not null,
  -- rolling-origin calibration backtest; null when the run skipped it
  backtest        jsonb,
  -- filled in by later runs: how many forecast days have passed and how many held
  realized        jsonb,
  is_synthetic    boolean     not null default false,
  worker_version  text
);

create index if not exists monthly_forecast_runs_as_of_desc
  on public.monthly_forecast_runs (as_of desc);

alter table public.monthly_forecast_runs enable row level security;

drop policy if exists monthly_forecast_runs_read on public.monthly_forecast_runs;
create policy monthly_forecast_runs_read
  on public.monthly_forecast_runs
  for select
  to anon, authenticated
  using (true);

-- No write policy: only the service role (the worker) writes, and it bypasses RLS.

-- Catalogue row for the feed-health rail. Mirrors SOURCES in src/lib/sources.ts
-- (also present in 0002 for fresh databases; repeated here so an existing
-- database picks it up without re-running 0002).
insert into public.data_source_status
  (source_key, display_name, category, requires_key, is_enabled, unlock_note)
values
  ('internal_monthly', 'Monthly Monte Carlo worker', 'forecast', false, true, 'Written weekly by the Python worker (iris_worker.monthly). With Supabase: apply supabase/migrations/0008_monthly_forecast.sql, add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as GitHub Actions secrets and run the "Monthly forecast" workflow once. Locally: set MONTHLY_LOCAL_DIR=worker/out and run python -m iris_worker.scheduler --once monthly.')
on conflict (source_key) do update set
  display_name = excluded.display_name,
  category     = excluded.category,
  requires_key = excluded.requires_key,
  unlock_note  = excluded.unlock_note;
