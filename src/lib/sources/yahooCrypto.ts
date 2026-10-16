/**
 * Yahoo Finance chart API for BTC-USD — the last-resort candle source.
 *
 * Coinbase and Kraken are the primary sources. During local testing on
 * 2026-10-16 both (and the other exchange APIs) intermittently reset or timed
 * out for minutes at a time while query1.finance.yahoo.com kept answering;
 * without this tier every price panel fell back to MOCK whenever that
 * happened. Yahoo's BTC-USD daily bars are UTC days and match the series the
 * weekly classifier was trained on exactly.
 *
 * Volume here is quoted in USD, not BTC — callers that only need closes (most of
 * them) are unaffected.
 */
import { fetchJson } from './http';
import type { Candle, CoinbaseStats } from './coinbase';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** Yahoo interval + range that yields at least Kraken's 720 candles where Yahoo allows. */
const PLAN: Record<string, { interval: string; range: string; group: number }> = {
  '1m': { interval: '1m', range: '1d', group: 1 },
  '5m': { interval: '5m', range: '5d', group: 1 },
  '15m': { interval: '15m', range: '1mo', group: 1 },
  '1h': { interval: '1h', range: '3mo', group: 1 },
  // Yahoo has no 4h bar; build it from 1h.
  '4h': { interval: '1h', range: '6mo', group: 4 },
  '1d': { interval: '1d', range: '2y', group: 1 },
  '1w': { interval: '1wk', range: '15y', group: 1 },
};

interface ChartResponse {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
  };
}

async function rawCandles(symbol: string, interval: string, range: string, revalidate: number) {
  const j = await fetchJson<ChartResponse>(
    `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    { revalidate },
  );
  const r = j?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q || !Array.isArray(r.timestamp)) throw new Error(`yahoo: no candles for ${symbol}`);

  const out: Candle[] = [];
  r.timestamp.forEach((ts, i) => {
    const c = q.close?.[i];
    // A null close is a gap, not a price of zero.
    if (c == null || !(c > 0)) return;
    out.push({
      ts,
      open: q.open?.[i] ?? c,
      high: q.high?.[i] ?? c,
      low: q.low?.[i] ?? c,
      close: c,
      volume: q.volume?.[i] ?? 0,
    });
  });
  return out;
}

function group(candles: Candle[], n: number): Candle[] {
  if (n <= 1) return candles;
  const bucket = n * 3600;
  const by = new Map<number, Candle>();
  for (const c of candles) {
    const k = Math.floor(c.ts / bucket) * bucket;
    const g = by.get(k);
    if (!g) by.set(k, { ...c, ts: k });
    else {
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close;
      g.volume += c.volume;
    }
  }
  return [...by.values()].sort((a, b) => a.ts - b.ts);
}

/** Candles oldest-first, same shape as Coinbase/Kraken. */
export async function getCandles(interval = '1d', symbol = 'BTC-USD'): Promise<Candle[]> {
  const p = PLAN[interval] ?? PLAN['1d'];
  const rows = await rawCandles(symbol, p.interval, p.range, p.interval === '1d' ? 300 : 60);
  const out = group(rows, p.group);
  if (out.length < 2) throw new Error(`yahoo: ${symbol} ${interval} returned ${out.length} candles`);
  return out;
}

/** Rolling 24h stats from hourly bars — stands in for Coinbase `/stats`. */
export async function getStats24h(symbol = 'BTC-USD'): Promise<CoinbaseStats> {
  const rows = await rawCandles(symbol, '1h', '5d', 60);
  if (rows.length < 25) throw new Error(`yahoo: ${symbol} returned ${rows.length} hourly bars`);
  const day = rows.slice(-24);
  const last = day[day.length - 1].close;
  return {
    open: day[0].open,
    high: Math.max(...day.map((c) => c.high)),
    low: Math.min(...day.map((c) => c.low)),
    last,
    // Yahoo quotes crypto volume in USD; Coinbase /stats quotes it in BTC.
    volume: day.reduce((s, c) => s + c.volume, 0) / last,
    volume30day: 0,
  };
}
