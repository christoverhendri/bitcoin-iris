/**
 * Derivatives market data — perpetual funding, open interest, and options.
 * Every endpoint here is keyless public market data; none requires a key, a
 * signature, or an account.
 *
 *   Bybit   v5 public market  — perp ticker + open-interest history
 *   OKX     v5 public         — funding rate for BTC-USD-SWAP
 *   Binance fapi public       — premiumIndex (mark/index/last funding)
 *   Deribit v2 public         — DVOL implied-vol index + option book summary
 *
 * All functions throw on a non-2xx, a timeout, or a payload that does not carry
 * the fields we need. `defineFeature` turns a throw into a badged mock panel,
 * and `live.ts` uses `Promise.allSettled` so one dead venue cannot blank the
 * whole page.
 */
import { fetchJson } from './http';

/* -------------------------------------------------------------- Bybit ---- */

export interface PerpTicker {
  lastPrice: number;
  markPrice: number;
  indexPrice: number;
  /** Open interest denominated in BTC (Bybit reports contracts = BTC on linear). */
  openInterestBtc: number;
  /** Per-period (8h) funding rate as a decimal fraction, e.g. 0.0001 = 0.01%. */
  fundingRate: number;
}

interface BybitEnvelope<T> {
  retCode?: number;
  retMsg?: string;
  result?: T;
}

interface BybitTickerRow {
  lastPrice?: string;
  indexPrice?: string;
  markPrice?: string;
  openInterest?: string;
  openInterestValue?: string;
  fundingRate?: string;
  nextFundingTime?: string;
  price24hPcnt?: string;
}

const BYBIT = 'https://api.bybit.com/v5/market';

/** Number-or-throw. Upstreams hand back strings, and `Number('')` is 0. */
function num(raw: unknown, what: string): number {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(n)) {
    throw new Error(`derivatives: bad ${what} (${String(raw)})`);
  }
  return n;
}

/** Linear BTCUSDT perp ticker: price, mark, index, OI and current funding. */
export async function getBybitTicker(): Promise<PerpTicker> {
  const j = await fetchJson<BybitEnvelope<{ list?: BybitTickerRow[] }>>(
    `${BYBIT}/tickers?category=linear&symbol=BTCUSDT`,
    { revalidate: 120 },
  );
  const row = j.result?.list?.[0];
  if (!row) throw new Error('derivatives: bybit ticker returned no rows');

  return {
    lastPrice: num(row.lastPrice, 'bybit lastPrice'),
    markPrice: num(row.markPrice, 'bybit markPrice'),
    indexPrice: num(row.indexPrice, 'bybit indexPrice'),
    openInterestBtc: num(row.openInterest, 'bybit openInterest'),
    fundingRate: num(row.fundingRate, 'bybit fundingRate'),
  };
}

/**
 * Hourly open-interest history, returned **oldest-first**. Bybit hands it back
 * newest-first, which would draw the chart backwards.
 */
export async function getBybitOiHistory(limit = 48): Promise<{ ts: number; oi: number }[]> {
  const j = await fetchJson<BybitEnvelope<{ list?: { openInterest?: string; timestamp?: string }[] }>>(
    `${BYBIT}/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=${limit}`,
    { revalidate: 300 },
  );
  const list = j.result?.list;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('derivatives: bybit open-interest returned no rows');
  }

  const out = list
    .map((r) => ({ ts: Number(r.timestamp), oi: Number(r.openInterest) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.oi) && p.oi > 0)
    .sort((a, b) => a.ts - b.ts);

  if (out.length === 0) throw new Error('derivatives: bybit open-interest had no usable points');
  return out;
}

/* ---------------------------------------------------------------- OKX ---- */

/** Current per-period funding rate for the BTC-USD inverse swap, as a fraction. */
export async function getOkxFunding(): Promise<number> {
  const j = await fetchJson<{ data?: { fundingRate?: string }[] }>(
    'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USD-SWAP',
    { revalidate: 120 },
  );
  const row = j.data?.[0];
  if (!row) throw new Error('derivatives: okx funding returned no rows');
  return num(row.fundingRate, 'okx fundingRate');
}

/* ------------------------------------------------------------ Binance ---- */

/**
 * Binance USD-M premium index. Binance geo-blocks some regions with a 451; the
 * caller treats a rejection here as "this venue did not answer" rather than an
 * error, so the panel still renders from Bybit and OKX.
 */
export async function getBinanceFunding(): Promise<{
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
}> {
  const j = await fetchJson<{
    markPrice?: string;
    indexPrice?: string;
    lastFundingRate?: string;
  }>('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', { revalidate: 120 });

  return {
    fundingRate: num(j.lastFundingRate, 'binance lastFundingRate'),
    markPrice: num(j.markPrice, 'binance markPrice'),
    indexPrice: num(j.indexPrice, 'binance indexPrice'),
  };
}

/* ------------------------------------------------------------ Deribit ---- */

/**
 * DVOL — Deribit's BTC implied-volatility index, hourly, oldest-first.
 * This is *forward-looking* option-implied vol, not the realised vol computed
 * from candles on the Quant page.
 */
export async function getDeribitDvol(days = 7): Promise<{ ts: number; close: number }[]> {
  const end = Date.now();
  const start = end - days * 86_400_000;
  const j = await fetchJson<{ result?: { data?: number[][] } }>(
    'https://www.deribit.com/api/v2/public/get_volatility_index_data' +
      `?currency=BTC&start_timestamp=${start}&end_timestamp=${end}&resolution=3600`,
    { revalidate: 900 },
  );

  const rows = j.result?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('derivatives: deribit dvol returned no rows');
  }

  // Each row is [timestampMs, open, high, low, close].
  const out = rows
    .map((r) => ({ ts: Number(r[0]), close: Number(r[4]) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.ts - b.ts);

  if (out.length === 0) throw new Error('derivatives: deribit dvol had no usable points');
  return out;
}

export interface OptionSummary {
  totalOi: number;
  callOi: number;
  putOi: number;
  putCallRatio: number;
  maxPainStrike: number;
  underlying: number;
}

interface DeribitBookRow {
  instrument_name?: string;
  open_interest?: number;
  underlying_price?: number;
  mark_price?: number;
}

/**
 * Whole-chain option summary from Deribit's book: put/call OI ratio and max pain.
 *
 * MAX PAIN — the strike at which the aggregate payout to option *holders* is
 * smallest, i.e. where writers lose least. For a candidate settlement price S:
 *
 *     pain(S) = Σ_calls oi_K · max(0, S − K) + Σ_puts oi_K · max(0, K − S)
 *
 * The max-pain strike is the S minimising that sum. Candidates are the distinct
 * strikes actually listed, and only instruments with open_interest > 0 are
 * counted — a strike nobody holds contributes no payout and would otherwise
 * drag the minimum toward the empty tails of the chain.
 */
export async function getDeribitOptions(): Promise<OptionSummary> {
  const rows = await fetchJson<{ result?: DeribitBookRow[] }>(
    'https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option',
    { revalidate: 900 },
  ).then((j) => j.result);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('derivatives: deribit option book returned no rows');
  }

  // instrument_name is `BTC-26DEC26-100000-C`: strike then C/P in the tail.
  const legs: { strike: number; oi: number; isCall: boolean }[] = [];
  let underlying = 0;

  for (const r of rows) {
    const oi = Number(r.open_interest);
    if (!Number.isFinite(oi) || oi <= 0) continue;

    const parts = (r.instrument_name ?? '').split('-');
    if (parts.length < 4) continue;
    const side = parts[parts.length - 1];
    const strike = Number(parts[parts.length - 2]);
    if (!Number.isFinite(strike) || strike <= 0) continue;
    if (side !== 'C' && side !== 'P') continue;

    legs.push({ strike, oi, isCall: side === 'C' });

    const u = Number(r.underlying_price);
    if (Number.isFinite(u) && u > 0) underlying = u;
  }

  if (legs.length === 0) throw new Error('derivatives: deribit option book had no open interest');

  let callOi = 0;
  let putOi = 0;
  for (const l of legs) {
    if (l.isCall) callOi += l.oi;
    else putOi += l.oi;
  }

  const strikes = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b);
  let maxPainStrike = strikes[0];
  let minPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const l of legs) {
      pain += l.isCall ? l.oi * Math.max(0, s - l.strike) : l.oi * Math.max(0, l.strike - s);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = s;
    }
  }

  const totalOi = callOi + putOi;
  if (totalOi <= 0) throw new Error('derivatives: deribit option open interest summed to zero');

  return {
    totalOi,
    callOi,
    putOi,
    putCallRatio: callOi > 0 ? putOi / callOi : 0,
    maxPainStrike,
    underlying,
  };
}
