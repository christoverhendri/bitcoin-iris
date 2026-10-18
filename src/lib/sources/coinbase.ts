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
  /** When the source says these stats are from (ISO). Coinbase /stats carries none. */
  asOf?: string | null;
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

/**
 * Spot bid/ask/last. Cheapest call; used for the freshest last price. `time` is
 * Coinbase's own trade timestamp — the honest age of the price, which survives a
 * cached response (render time would not).
 */
export async function getSpot(
  product = 'BTC-USD',
): Promise<{ price: number; volume: number; time: string | null }> {
  const j = await fetchJson<Record<string, string>>(`${BASE}/products/${product}/ticker`, {
    revalidate: 30,
  });
  const t = Date.parse(j.time ?? '');
  return {
    price: Number(j.price),
    volume: Number(j.volume),
    time: Number.isFinite(t) ? new Date(t).toISOString() : null,
  };
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
  const end = Math.floor(Date.now() / 1000);
  const start = end - g * Math.min(limit, 300);
  const url = `${BASE}/products/${product}/candles?granularity=${g}&start=${start}&end=${end}`;
  const rows = await fetchJson<number[][]>(url, { revalidate: 60 });
  return rows
    .map((r) => ({ ts: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] }))
    .sort((a, b) => a.ts - b.ts);
}

const DAY_S = 86_400;
/** Coinbase hands back at most 300 candles per request, whatever you ask for. */
const PAGE_DAYS = 300;

/**
 * Many years of daily candles, assembled by walking Coinbase's 300-candle
 * window backwards. Returned oldest-first.
 *
 * The 300-candle cap is per *response*, not per product — passing an explicit
 * `start`/`end` pair moves the window anywhere in history, and BTC-USD goes back
 * to 2015. That is the difference between a forecast built on two years of data
 * (Kraken's ceiling, and CoinGecko refuses anything past 365 days without a paid
 * key) and one built on a decade spanning two halvings and two full cycles.
 *
 * Requests go out in **small concurrent batches**. Fully sequential costs about
 * eight seconds on a cold cache (measured), which is too slow to render behind;
 * firing all thirteen at once earns a 429 mid-assembly and would silently
 * produce a series with a hole in it. Coinbase allows roughly 10 req/s, so a
 * batch of four with a short pause between batches stays well inside the limit
 * and cuts the cold cost to a couple of seconds. Warm, Next serves the whole
 * thing from its data cache.
 *
 * Throws when fewer than `minCandles` survive — the caller degrades to a shorter
 * source or to the badged mock rather than forecasting off a stub.
 */
const BATCH = 4;

export async function getDailyHistory(
  years = 10,
  product = 'BTC-USD',
  minCandles = 400,
): Promise<Candle[]> {
  const pages = Math.ceil((years * 365) / PAGE_DAYS);
  const now = Math.floor(Date.now() / 1000);
  const byTs = new Map<number, Candle>();

  const fetchPage = async (i: number): Promise<number[][] | null> => {
    const end = now - i * PAGE_DAYS * DAY_S;
    const start = end - PAGE_DAYS * DAY_S;
    const url = `${BASE}/products/${product}/candles?granularity=${DAY_S}&start=${start}&end=${end}`;
    try {
      // A day of history from five years ago is immutable; cache it hard.
      return await fetchJson<number[][]>(url, { revalidate: 86_400 });
    } catch {
      // A failed page costs its window, not the series.
      return null;
    }
  };

  for (let base = 0; base < pages; base += BATCH) {
    const idx = Array.from(
      { length: Math.min(BATCH, pages - base) },
      (_, k) => base + k,
    );
    const results = await Promise.all(idx.map(fetchPage));

    let sawData = false;
    for (const rows of results) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      sawData = true;
      for (const r of rows) {
        const c = { ts: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] };
        if (!Number.isFinite(c.ts) || !Number.isFinite(c.close) || c.close <= 0) continue;
        byTs.set(c.ts, c);
      }
    }

    // An entire batch empty means we have walked past the listing's first day.
    if (!sawData) break;
    if (base + BATCH < pages) await new Promise((res) => setTimeout(res, 80));
  }

  const out = [...byTs.values()].sort((a, b) => a.ts - b.ts);
  if (out.length < minCandles) {
    throw new Error(`coinbase: daily history returned ${out.length} candles, need ${minCandles}`);
  }
  return out;
}
