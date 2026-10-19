-- Forward validation of the weekly signal (2026-10-19).
-- Each published clf_signals row gains `realized` once its 7 days have closed:
-- {end_date, close_as_of, close_end, return_7d, label UP|DOWN|NOISE, correct,
--  week_close, scored_at}, written by worker/iris_worker/forward_validation.py.
-- Published rows are otherwise never edited. The existing public-read policy
-- covers the new column; only the service role writes.
alter table public.clf_signals add column if not exists realized jsonb;
