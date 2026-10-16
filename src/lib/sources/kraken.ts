/**
 * Kraken public OHLC. Keyless, up to 720 candles per call — the fallback when
 * Coinbase throws or returns nothing, and the source for anything that wants
 * more than Coinbase's 300-candle window (seasonality).
 *
 * Every candle consumer ends its chain here, so this is also where the last
 * tier lives: when Kraken itself is unreachable, BTC candles come from
 * Yahoo's BTC-USD instead. See
 * `yahooCrypto.ts`.
 *
 * Docs: https://docs.kraken.com/api/docs/rest-api/get-ohlc-data
 */
import { fetchJson } from './http';
import type { Candle } from './coinbase';
import { getCandles as yahooCandles } from './yahooCrypto';

const BASE = 'https://api.kraken.com/0/public';

const INTERVAL_MIN: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
  '1w': 10080,
};

interface KrakenOhlcResponse {
  error: string[];
  result: Record<string, (string | number)[][]>;
}

/** Candles oldest-first: Kraken, then Yahoo BTC-USD for the BTC pair. */
export async function getCandles(interval = '1d', pair = 'XBTUSD'): Promise<Candle[]> {
  try {
    return await getKrakenCandles(interval, pair);
  } catch (err) {
    if (pair !== 'XBTUSD') throw err;
    return yahooCandles(interval, 'BTC-USD');
  }
}

/** Kraken only. Shape: `[time,o,h,l,c,vwap,volume,count]`. */
export async function getKrakenCandles(interval = '1d', pair = 'XBTUSD'): Promise<Candle[]> {
  const min = INTERVAL_MIN[interval] ?? 1440;
  const j = await fetchJson<KrakenOhlcResponse>(
    `${BASE}/OHLC?pair=${pair}&interval=${min}`,
    { revalidate: 60 },
  );
  if (j.error?.length) throw new Error(`kraken: ${j.error.join(', ')}`);
  const key = Object.keys(j.result).find((k) => k !== 'last');
  if (!key) throw new Error('kraken: no result series');
  return j.result[key].map((r) => ({
    ts: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6]),
  }));
}
