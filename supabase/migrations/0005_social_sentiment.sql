-- social_sentiment_daily: daily share of BTC social-media posts labelled
-- positive / neutral / negative, from Santiment.
--
-- Written by the Python worker job `social_sentiment` (daily, service role).
-- Read by `src/lib/features/socialSentiment/live.ts` (anon, public read).
--
-- Source metrics: sentiment_{positive,neutral,negative}_ratio_total_1d.
-- Santiment's definition: labelled document counts per bucket divided by their
-- sum, per day, across Twitter, Reddit, Telegram and 4chan. The three ratios
-- of a row sum to 1 (the worker rejects any day that does not).
--
-- On Santiment's free plan the latest 30 days are withheld, so the newest row
-- is about a month old. The panel says so.
--
-- Apply with: supabase db push, or paste into the Supabase SQL Editor.

create table if not exists public.social_sentiment_daily (
  date            date             not null,
  slug            text             not null default 'bitcoin',
  positive_ratio  double precision not null check (positive_ratio between 0 and 1),
  neutral_ratio   double precision not null check (neutral_ratio between 0 and 1),
  negative_ratio  double precision not null check (negative_ratio between 0 and 1),
  fetched_at      timestamptz      not null default now(),
  is_synthetic    boolean          not null default false,
  -- Re-running the job for the same day merges in place instead of duplicating.
  primary key (date, slug)
);

create index if not exists social_sentiment_daily_date_desc
  on public.social_sentiment_daily (date desc);

alter table public.social_sentiment_daily enable row level security;

drop policy if exists social_sentiment_daily_read on public.social_sentiment_daily;
create policy social_sentiment_daily_read
  on public.social_sentiment_daily
  for select
  to anon, authenticated
  using (true);

-- Deliberately NO insert/update/delete policy. The service role bypasses RLS to write.
