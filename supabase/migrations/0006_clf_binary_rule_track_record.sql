-- clf_signals: support the notebook's binary threshold, and carry the signal's
-- out-of-sample track record.
--
-- 1. Binary rule. The 2026-10-16 export tunes one threshold (`avg_threshold`,
--    0.06): BULL if p_up >= threshold, else BEAR. The worker stores it in both
--    t_bear and t_bull (rule_method = 'binary_avg_threshold'), which the old
--    `t_bear < t_bull` check rejected. It becomes `<=`.
--
-- 2. Track record. How often the same signal was right on the notebook's test
--    set (labelled weeks only), computed from parity_check.csv by
--    `python -m iris_worker.track_record`. This — not the uncalibrated p_up — is
--    the "confidence" the dashboard shows. Nullable: rows written before this
--    migration, or by a model without a track record, have none.
--
-- Apply with: supabase db push, or paste into the Supabase SQL Editor.

alter table public.clf_signals drop constraint if exists clf_signals_threshold_order;
alter table public.clf_signals
  add constraint clf_signals_threshold_order check (t_bear <= t_bull);

alter table public.clf_signals add column if not exists track_precision double precision
  check (track_precision is null or track_precision between 0 and 1);
alter table public.clf_signals add column if not exists track_n int;
alter table public.clf_signals add column if not exists track_base_rate double precision;
alter table public.clf_signals add column if not exists track_eval_from date;
alter table public.clf_signals add column if not exists track_eval_to date;
