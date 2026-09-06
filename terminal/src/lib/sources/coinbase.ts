/**
 * Coinbase Exchange public market data. Keyless, no geo-block from US IPs,
 * ~10 req/s. This is the primary price source for the whole terminal.
 *
 * Docs: https://docs.cdp.coinbase.com/exchange/reference
 */
import { fetchJson } from './http';

const BASE = 'https://api.exchange.coinbase.com';

/** One OHLCV candle, oldest-to-newest ordering guaranteed by the callers here. */
export interface Candle {
  ts: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CoinbaseStats {
  open: number;
  high: number;
  low: number;
  last: number;
  volume: number;
  volume30day: number;
}

/** 24h rolling stats for a product. Powers the snapshot's 24h fields. */
export async function getStats(product = 'BTC-USD'): Promise<CoinbaseStats> {
  const j = await fetchJson<Record<string, string>>(`${BASE}/products/${product}/stats`, {
    revalidate: 60,
  });
  return {
    open: Number(j.open),
    high: Number(j.high),
    low: Number(j.low),
    last: Number(j.last),
    volume: Number(j.volume),
    volume30day: Number(j.volume_30day),
  };
}

/** Spot bid/ask/last. Cheapest call; used for the freshest last price. */
export async function getSpot(product = 'BTC-USD'): Promise<{ price: number; volume: number }> {
  const j = await fetchJson<Record<string, string>>(`${BASE}/products/${product}/ticker`, {
    revalidate: 30,
  });
  return { price: Number(j.price), volume: Number(j.volume) };
}

const GRANULARITY: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

/**
 * Historical candles, returned oldest-first. Coinbase caps a response at 300
 * candles and hands them back newest-first with shape
 * `[time, low, high, open, close, volume]` — both quirks are normalised here.
 */
export async function getCandles(
  interval = '1d',
  limit = 300,
  product = 'BTC-USD',
): Promise<Candle[]> {
  const g = GRANULARITY[interval] ?? 86400;
  // Match the 60s cache window; second-by-second URLs defeat fetch caching.
  const end = Math.floor(Date.now() / 60_000) * 60;
  const start = end - g * Math.min(limit, 300);
  const url = `${BASE}/products/${product}/candles?granularity=${g}&start=${start}&end=${end}`;
  const rows = await fetchJson<number[][]>(url, { revalidate: 60 });
  return rows
    .map((r) => ({ ts: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] }))
    .sort((a, b) => a.ts - b.ts);
}
