-- Whale events: the terminal's first written table.
--
-- Why it exists: the Whale Alert free tier only returns roughly the last ten
-- minutes and offers no historical access at all. Without somewhere to keep
-- them, the wire would hold ten minutes of events and go blank whenever the
-- upstream hiccupped. `/api/ingest/whale` appends here every five minutes; the
-- web app only ever reads.
--
-- Apply with: supabase db push, or paste into the SQL editor.

create table if not exists public.whale_events (
  -- Upstream event id. Primary key rather than a surrogate, so a cron run that
  -- overlaps the previous one upserts instead of duplicating.
  id            text        primary key,
  ts            timestamptz not null,
  blockchain    text        not null,
  symbol        text        not null,
  -- numeric, not double precision: a USDT transfer is billions of units and a
  -- BTC one is fractional. Float would round both wrong in different directions.
  amount        numeric     not null,
  amount_usd    numeric     not null,
  from_label    text,
  to_label      text,
  -- Mirrors FlowKind in src/lib/onchain/classifyFlow.ts.
  kind          text        not null,
  -- Mirrors FlowBias: bullish | bearish | neutral.
  bias          text        not null,
  impact        int         not null,
  tx_url        text,
  -- Set when a row was written by a mock/backfill run. `whaleEvents/live.ts`
  -- badges the whole batch when any row carries it, so synthetic data can never
  -- reach a pixel unlabelled.
  is_synthetic  boolean     not null default false,
  fetched_at    timestamptz not null default now()
);

-- The only access pattern: newest N.
create index if not exists whale_events_ts_desc on public.whale_events (ts desc);

alter table public.whale_events enable row level security;

-- Read is public; the terminal has no login and the data is public chain
-- activity either way.
drop policy if exists whale_events_read on public.whale_events;
create policy whale_events_read
  on public.whale_events
  for select
  to anon, authenticated
  using (true);

-- Deliberately NO insert/update/delete policy. The service role bypasses RLS,
-- so the ingestion route can write and nobody holding the publishable key can.
