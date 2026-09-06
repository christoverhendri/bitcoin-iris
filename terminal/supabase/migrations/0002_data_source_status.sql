-- data_source_status: the feed catalogue, and what each feed is currently doing.
--
-- `src/lib/sources.ts` has always described itself as "the same list seeded into
-- data_source_status". Until now that table did not exist, so `getAllSourceStatus`
-- returned an empty map on every request and the terminal ran entirely on the
-- static fallback. This migration makes the sentence true.
--
-- What it buys, concretely:
--   - disabling a source, or rewriting the unlock note shown in a MOCK tooltip,
--     becomes an UPDATE rather than a deploy
--   - an ingestion job can report what actually happened on its last run
--
-- Important: seeding this table does NOT reduce the feed count. `computeLiveSources`
-- in src/lib/features/feedHealth/index.ts treats these rows as corrections to the
-- static wired list, not as a replacement for it. A row at mode 'unknown' says
-- nothing and changes nothing. That behaviour is covered by feedHealth.test.ts —
-- if it regresses, the rail footer collapses to near zero with nothing broken.
--
-- Column names and types must stay in step with `SourceStatusRow` in
-- src/lib/sourceStatus.ts, which is the read contract.
--
-- Apply with: supabase db push, or paste into the SQL editor.

create table if not exists public.data_source_status (
  source_key           text        primary key,
  display_name         text        not null,
  category             text        not null,
  is_enabled           boolean     not null default true,
  requires_key         boolean     not null default false,
  -- live | mock | degraded | failed | unknown. 'unknown' is the honest default:
  -- nothing has reported yet.
  mode                 text        not null default 'unknown',
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  last_error           text,
  last_row_count       int,
  consecutive_failures int         not null default 0,
  unlock_note          text
);

alter table public.data_source_status enable row level security;

-- Read is public: it is a status board, and the app renders it in the rail
-- footer for every visitor.
drop policy if exists data_source_status_read on public.data_source_status;
create policy data_source_status_read
  on public.data_source_status
  for select
  to anon, authenticated
  using (true);

-- Deliberately NO insert/update/delete policy. The service role bypasses RLS, so
-- ingestion routes can write and nobody holding the publishable key can.

-- Catalogue seed, generated from SOURCES in src/lib/sources.ts.
--
-- ON CONFLICT updates only the catalogue columns and leaves the runtime ones
-- (mode, timestamps, error, counters) alone — re-running this migration must not
-- erase what the jobs have reported.
insert into public.data_source_status
  (source_key, display_name, category, requires_key, is_enabled, unlock_note)
values
  ('coinbase', 'Coinbase Exchange', 'market', false, true, null),
  ('yfinance', 'Yahoo Finance', 'market', false, true, null),
  ('coingecko', 'CoinGecko', 'market', true, true, 'Register a free CoinGecko demo key and set COINGECKO_API_KEY in worker/.env.'),
  ('derivatives', 'Derivatives (Bybit/OKX/Deribit)', 'market', false, true, null),
  ('internal_quant', 'Quant pipeline', 'quant', false, true, null),
  ('internal_forecast', 'Forecast pipeline', 'forecast', false, true, null),
  ('alternative_me', 'Fear & Greed (alternative.me)', 'sentiment', false, true, null),
  ('fred', 'FRED', 'macro', true, true, 'Register a free FRED API key and set FRED_API_KEY in worker/.env.'),
  ('internal_macro_regime', 'Macro regime engine', 'macro', false, true, null),
  ('cryptopanic', 'CryptoPanic', 'news', true, true, 'CryptoPanic developer plan is free — set CRYPTOPANIC_TOKEN in worker/.env.'),
  ('rss', 'Crypto RSS feeds', 'news', false, true, null),
  ('twitterapi_io', 'Tracked accounts', 'sentiment', true, true, 'Nitter is dead (every public instance 4xx/410 as of 2026-09-03), so the only live path left is paid: set TWITTERAPI_IO_KEY. The whale/on-chain accounts this was meant for are covered by the Whale Alert source instead.'),
  ('onchain_provider', 'On-chain metrics', 'onchain', true, true, 'No free provider covers these metrics. Requires a paid on-chain data subscription.'),
  ('arkham', 'Arkham Intelligence', 'onchain', true, true, 'Apply for API access at docs.intel.arkm.com. Scraping the site is not an option.'),
  ('mempool_space', 'mempool.space', 'onchain', false, true, null),
  ('whale_alert', 'Whale Alert', 'onchain', true, true, 'Register a free tier key at whale-alert.io, set WHALE_ALERT_API_KEY, and point a 5-minute cron at /api/ingest/whale.'),
  ('internal_confluence', 'Confluence engine', 'research', false, true, null)
on conflict (source_key) do update set
  display_name = excluded.display_name,
  category     = excluded.category,
  requires_key = excluded.requires_key,
  unlock_note  = excluded.unlock_note;
