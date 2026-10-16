-- clf_signals: 7-day Bitcoin direction classification signal table.
--
-- Why it exists: Stores weekly signals computed by the Python worker
-- (APScheduler / standalone cron). Replaces the heuristic rule-based weekly forecast
-- with a trained Average Ensemble XGBoost model (MacroCrossAsset + Universal).
-- Decisions follow the dual-threshold validation rule (BULL / BEAR / NONE).
--
-- Apply with: supabase db push, or paste into the Supabase SQL Editor.

create table if not exists public.clf_signals (
  -- As-of date of the underlying market & macro data. Primary key ensures
  -- that running the worker repeatedly for the same date updates/merges in-place
  -- rather than duplicating rows.
  as_of             date             primary key,
  horizon_days      int              not null default 7,
  -- 3-state classification decision from researcher threshold rule:
  -- p_up > t_bull -> 'BULL'; p_up < t_bear -> 'BEAR'; otherwise -> 'NONE' (rendered as 'NO SIGNAL' in UI)
  signal            text             not null check (signal in ('BULL', 'BEAR', 'NONE')),
  -- Raw uncalibrated probability of upward 7-day movement from average ensemble
  p_up              double precision not null,
  t_bear            double precision not null,
  t_bull            double precision not null,
  -- Binary model threshold & direction (baseline F1 break-even)
  threshold_binary  double precision not null,
  direction_binary  text             not null check (direction_binary in ('BULL', 'BEAR')),
  margin            double precision not null,
  -- Detailed breakdowns & diagnostics stored as jsonb
  gate_pass         jsonb            not null default '{}'::jsonb,
  per_domain        jsonb            not null default '{}'::jsonb,
  n_nan_features    jsonb            not null default '{}'::jsonb,
  rule_method       text             not null,
  model_name        text             not null,
  model_created_utc text             not null,
  model_train_end   date             not null,
  model_domains     jsonb            not null default '[]'::jsonb,
  val_f1_macro      double precision not null,
  test_f1_macro     double precision not null,
  is_synthetic      boolean          not null default false,
  created_at        timestamptz      not null default now(),
  constraint clf_signals_threshold_order check (t_bear < t_bull)
);

create index if not exists clf_signals_as_of_desc on public.clf_signals (as_of desc);

alter table public.clf_signals enable row level security;

-- Read is public: anon and authenticated can read signals for the terminal display.
drop policy if exists clf_signals_read on public.clf_signals;
create policy clf_signals_read
  on public.clf_signals
  for select
  to anon, authenticated
  using (true);

-- Deliberately NO insert/update/delete policy. Service role key bypasses RLS to write.
