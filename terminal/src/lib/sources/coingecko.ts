/**
 * CoinGecko public API. Keyless works but is rate-limited hard (~5-15 req/min
 * from a shared IP), so every call here uses a long revalidate window. If
 * `COINGECKO_API_KEY` (a free demo key) is set, it is sent and the limit rises.
 *
 * Supplies the snapshot fields Coinbase cannot: market cap, dominance, and the
 * 7d / 30d return percentages.
 *
 * Docs: https://docs.coingecko.com/reference/introduction
 */
import { fetchJson } from './http';

const BASE = 'https://api.coingecko.com/api/v3';

function auth(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

export interface CoinGeckoMarket {
  current_price: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
}

/** `/coins/markets` for bitcoin with 7d + 30d change columns requested. */
export async function getMarket(): Promise<CoinGeckoMarket> {
  const url =
    `${BASE}/coins/markets?vs_currency=usd&ids=bitcoin` +
    `&price_change_percentage=7d,30d`;
  const rows = await fetchJson<CoinGeckoMarket[]>(url, { revalidate: 180, headers: auth() });
  if (!rows.length) throw new Error('coingecko: empty markets response');
  return rows[0];
}

/** BTC dominance as a percentage of total crypto market cap. */
export async function getDominancePct(): Promise<number> {
  const j = await fetchJson<{ data: { market_cap_percentage: Record<string, number> } }>(
    `${BASE}/global`,
    { revalidate: 300, headers: auth() },
  );
  return j.data.market_cap_percentage.btc;
}

/**
 * Daily close series, up to 365 days keyless. `[ms, price][]` — returned here as
 * `{ ts: seconds, close }`. Used where more history than Coinbase's 300 candles
 * is needed (seasonality).
 */
export async function getDailyCloses(days = 365): Promise<{ ts: number; close: number }[]> {
  const url = `${BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const j = await fetchJson<{ prices: [number, number][] }>(url, {
    revalidate: 3600,
    headers: auth(),
  });
  return j.prices.map(([ms, close]) => ({ ts: Math.floor(ms / 1000), close }));
}
