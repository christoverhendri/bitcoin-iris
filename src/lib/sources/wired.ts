import type { SourceKey } from '@/lib/envelope';

/**
 * Source keys whose `live.ts` reaches a real upstream directly (no Supabase, no
 * worker) — either an external API or an internal series computed from real
 * candles. This is what the rail footer counts as "live" until the ingestion
 * pipeline exists — see `feedHealth`.
 *
 * Keep this in sync with the `live.ts` files that actually fetch/compute. A key
 * here with a stubbed reader would make the footer lie.
 */
const BASE: SourceKey[] = [
  'coinbase', // snapshot, ohlcv -> Coinbase Exchange (+ Kraken fallback)
  'coingecko', // snapshot extras -> market cap, dominance, 7d/30d
  'alternative_me', // fearGreed -> alternative.me
  'derivatives', // funding / OI / DVOL / options -> Bybit, OKX, Binance, Deribit
  'cryptopanic', // news -> merged public RSS
  'rss', // news / events -> crypto RSS feeds
  'internal_quant', // indicators, levels, volatility, seasonality -> computed from real candles
  'internal_forecast', // weekly direction signal -> computed internally
  'internal_distribution', // multi-horizon FHS price distribution -> computed internally
  'internal_confluence', // confluence engine -> computed internally
  'onchain_provider', // chain supply / activity -> keyless blockchain.info
  'mempool_space', // network conditions -> keyless mempool.space (+ Blockchair extras)
  'positioning', // long/short ratios, taker flow, Coinbase premium -> Binance + Coinbase
  'etf_flows', // US spot ETF daily net flows -> bitbo.io, scraped and shape-validated
  'yfinance', // global markets + confluence MACRO layer -> keyless Yahoo chart API
  'coinmetrics', // halving cycle + power-law corridor -> keyless Coin Metrics (blockchain.com fallback)
];

/**
 * Keyed sources. Each only counts as wired when its key is set — otherwise its
 * `live.ts` throws on every call and the panels behind it are mock.
 *
 * `whale_alert` additionally needs the ingestion cron running, which nothing
 * here can observe. The key is the honest proxy: without it no row can ever be
 * written, and with it a stalled cron shows up as a stale `asOf` in the panel
 * footer rather than as a missing feed.
 */
export const WIRED_SOURCES: readonly SourceKey[] = [
  ...BASE,
  ...(process.env.FRED_API_KEY ? (['fred'] as const) : []),
  ...(process.env.WHALE_ALERT_API_KEY ? (['whale_alert'] as const) : []),
  // Database- or file-backed: rows exist only once the worker has run, so a
  // configured store is the proxy. A stalled schedule shows as a STALE `asOf`.
  ...(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.MONTHLY_LOCAL_DIR ? (['internal_monthly'] as const) : []),
];

export const WIRED_SOURCE_COUNT = WIRED_SOURCES.length;
