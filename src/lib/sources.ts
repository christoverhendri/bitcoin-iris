import type { SourceKey } from '@/lib/envelope';

/**
 * The feed catalogue. This is the same list seeded into `data_source_status`,
 * and it is what the sidebar counts ("FEEDS 4/17").
 *
 * `unlockNote` is the text shown in a MOCK badge tooltip. Keep it actionable —
 * it is the shortest path from "this panel is fake" to "here is how to fix it".
 */
export interface SourceDef {
  key: SourceKey;
  displayName: string;
  category: 'market' | 'quant' | 'forecast' | 'onchain' | 'sentiment' | 'news' | 'macro' | 'research';
  requiresKey: boolean;
  enabled: boolean;
  unlockNote: string | null;
}

export const SOURCES: SourceDef[] = [
  { key: 'coinbase', displayName: 'Coinbase Exchange', category: 'market', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'yfinance', displayName: 'Yahoo Finance', category: 'market', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'coingecko', displayName: 'CoinGecko', category: 'market', requiresKey: true, enabled: true, unlockNote: 'Register a free CoinGecko demo key and set COINGECKO_API_KEY in worker/.env.' },
  { key: 'derivatives', displayName: 'Derivatives (Bybit/OKX/Deribit)', category: 'market', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'positioning', displayName: 'Positioning (Binance futures + premium)', category: 'market', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'etf_flows', displayName: 'Spot ETF flows (bitbo.io)', category: 'market', requiresKey: false, enabled: true, unlockNote: 'Keyless, but scraped rather than an API: bitbo.io publishes the issuer table as server-rendered HTML. A layout change fails shape validation and lands here by design — there is nothing to configure. See src/lib/sources/etfFlows.ts.' },
  { key: 'internal_quant', displayName: 'Quant pipeline', category: 'quant', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'internal_forecast', displayName: 'Forecast pipeline', category: 'forecast', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'internal_distribution', displayName: 'Price distribution engine', category: 'forecast', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'internal_monthly', displayName: 'Monthly Monte Carlo worker', category: 'forecast', requiresKey: false, enabled: true, unlockNote: 'Written weekly by the Python worker (iris_worker.monthly). With Supabase: apply supabase/migrations/0008_monthly_forecast.sql, add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as GitHub Actions secrets and run the "Monthly forecast" workflow once. Locally: set MONTHLY_LOCAL_DIR=worker/out and run python -m iris_worker.scheduler --once monthly.' },
  { key: 'alternative_me', displayName: 'Fear & Greed (alternative.me)', category: 'sentiment', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'santiment', displayName: 'Santiment (social sentiment)', category: 'sentiment', requiresKey: true, enabled: true, unlockNote: 'Register at app.santiment.net and set SANTIMENT_API_KEY in worker/.env; the daily social_sentiment job writes social_sentiment_daily. The free plan withholds the latest 30 days.' },
  { key: 'fred', displayName: 'FRED', category: 'macro', requiresKey: true, enabled: true, unlockNote: 'Register a free FRED API key and set FRED_API_KEY in worker/.env.' },
  { key: 'internal_macro_regime', displayName: 'Macro regime engine', category: 'macro', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'cryptopanic', displayName: 'CryptoPanic', category: 'news', requiresKey: true, enabled: true, unlockNote: 'CryptoPanic developer plan is free — set CRYPTOPANIC_TOKEN in worker/.env.' },
  { key: 'rss', displayName: 'Crypto RSS feeds', category: 'news', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'twitterapi_io', displayName: 'Tracked accounts', category: 'sentiment', requiresKey: true, enabled: true, unlockNote: 'Nitter is dead (every public instance 4xx/410 as of 2026-09-03), so the only live path left is paid: set TWITTERAPI_IO_KEY. The whale/on-chain accounts this was meant for are covered by the Whale Alert source instead.' },
  { key: 'onchain_provider', displayName: 'On-chain metrics', category: 'onchain', requiresKey: true, enabled: true, unlockNote: 'No free provider covers these metrics. Requires a paid on-chain data subscription.' },
  { key: 'arkham', displayName: 'Arkham Intelligence', category: 'onchain', requiresKey: true, enabled: true, unlockNote: 'Apply for API access at docs.intel.arkm.com. Scraping the site is not an option.' },
  { key: 'mempool_space', displayName: 'mempool.space', category: 'onchain', requiresKey: false, enabled: true, unlockNote: null },
  { key: 'coinmetrics', displayName: 'Coin Metrics (daily close since 2010)', category: 'quant', requiresKey: false, enabled: true, unlockNote: 'Keyless Community API; falls back to blockchain.com market-price. If both are unreachable from this network the halving-cycle and power-law pages hide their panels.' },
  { key: 'whale_alert', displayName: 'Whale Alert', category: 'onchain', requiresKey: true, enabled: true, unlockNote: 'Register a free tier key at whale-alert.io, set WHALE_ALERT_API_KEY, and point a 5-minute cron at /api/ingest/whale.' },
  { key: 'internal_confluence', displayName: 'Confluence engine', category: 'research', requiresKey: false, enabled: true, unlockNote: null },
];

export const SOURCE_BY_KEY = new Map(SOURCES.map((s) => [s.key, s]));
export const ENABLED_SOURCE_COUNT = SOURCES.filter((s) => s.enabled).length;

/** Fallback unlock note when the database has no row for a source yet. */
export const unlockNoteFor = (key: SourceKey) => SOURCE_BY_KEY.get(key)?.unlockNote ?? null;
