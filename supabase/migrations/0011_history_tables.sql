-- History tables: news sentiment, daily snapshots, OHLCV archive (2026-10-21).
--
-- Why they exist: several feeds only expose "now" (scraped ETF flows, funding,
-- open interest, news scores). Whatever is not archived the day it is seen is
-- gone, and a backtest of sentiment-vs-price needs the history. These tables
-- are written by the Python worker / ingest routes with the service role; the
-- web app only reads.
--
-- Forward validation needs no table of its own: it lives in
-- clf_signals.realized (0009).
--
-- Apply with: supabase db push, or paste into the SQL editor.

-- One row per scored news article. `id` is a hash of the URL so a re-run of the
-- collector upserts instead of duplicating.
create table if not exists public.news_sentiment_items (
  id            text        primary key,
  published_at  timestamptz not null,
  source        text        not null,
  title         text        not null,
  url           text,
  -- Model output. score is signed (-1 bearish .. +1 bullish); label mirrors it.
  score         double precision not null,
  label         text        not null,
  confidence    double precision,
  model         text,
  scored_at     timestamptz not null default now()
);

create index if not exists news_sentiment_items_published_desc
  on public.news_sentiment_items (published_at desc);

-- One row per (day, snapshot kind): onchain | macro | quant | derivatives |
-- etf_flows | confluence. The payload is the feed's own normalised shape, so a
-- new field never needs a migration; promote a field to a column only when a
-- query needs to filter on it.
create table if not exists public.daily_snapshots (
  snap_date     date        not null,
  kind          text        not null,
  payload       jsonb       not null,
  -- Set when the value came from a mock/fallback run, so synthetic data can
  -- never be mistaken for an archived real reading.
  is_synthetic  boolean     not null default false,
  captured_at   timestamptz not null default now(),
  primary key (snap_date, kind)
);

create index if not exists daily_snapshots_kind_date
  on public.daily_snapshots (kind, snap_date desc);

-- Candle archive / cache. Composite key makes overlapping fetches idempotent.
create table if not exists public.ohlcv_candles (
  symbol    text             not null,
  interval  text             not null,
  ts        timestamptz      not null,
  open      numeric          not null,
  high      numeric          not null,
  low       numeric          not null,
  close     numeric          not null,
  volume    numeric          not null,
  source    text             not null default 'coinbase',
  primary key (symbol, interval, ts)
);

create index if not exists ohlcv_candles_lookup
  on public.ohlcv_candles (symbol, interval, ts desc);

alter table public.news_sentiment_items enable row level security;
alter table public.daily_snapshots     enable row level security;
alter table public.ohlcv_candles       enable row level security;

drop policy if exists news_sentiment_items_read on public.news_sentiment_items;
create policy news_sentiment_items_read on public.news_sentiment_items
  for select to anon, authenticated using (true);

drop policy if exists daily_snapshots_read on public.daily_snapshots;
create policy daily_snapshots_read on public.daily_snapshots
  for select to anon, authenticated using (true);

drop policy if exists ohlcv_candles_read on public.ohlcv_candles;
create policy ohlcv_candles_read on public.ohlcv_candles
  for select to anon, authenticated using (true);

-- Deliberately NO insert/update/delete policy: the service role bypasses RLS,
-- so ingestion can write and nobody holding the publishable key can.
