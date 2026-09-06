/**
 * Yahoo Finance chart API — keyless traditional-market series.
 *
 * The terminal's macro story was gated behind `FRED_API_KEY` and stayed mock
 * without one. FRED is still the right source for policy rates, CPI and GDP,
 * but the *market* side of macro — the dollar, equities, the vol complex, the
 * long bond, gold — is published here with no key and no signup.
 *
 * Endpoint: `/v8/finance/chart/<symbol>`. The sibling `/v10/finance/quoteSummary`
 * now answers 401 without a session crumb; it is deliberately NOT used. Anything
 * this module cannot get from the chart endpoint is not fetched at all.
 *
 * Two shape hazards, both handled below:
 *   - `indicators.quote[0].close` contains `null` for holidays and halts. Those
 *     entries are dropped alongside their timestamps rather than zero-filled — a
 *     zero close would poison every return and correlation computed downstream.
 *   - Symbols carry characters that must stay percent-encoded (`^GSPC`, `DX-Y.NYB`).
 *     Callers pass the plain symbol; encoding happens here.
 *
 * Throws on a non-2xx, a missing result, or a series too short to be useful.
 * `defineFeature` turns that into a badged mock.
 */
import { fetchJson } from './http';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** Symbols verified reachable and non-empty from this codebase. */
export const YAHOO_SYMBOLS = {
  dxy: 'DX-Y.NYB',
  spx: '^GSPC',
  vix: '^VIX',
  gold: 'GC=F',
  us10y: '^TNX',
} as const;

export type YahooKey = keyof typeof YAHOO_SYMBOLS;

/** Human labels, kept next to the symbols so a rename touches one place. */
export const YAHOO_LABEL: Record<YahooKey, string> = {
  dxy: 'DOLLAR INDEX',
  spx: 'S&P 500',
  vix: 'VIX',
  gold: 'GOLD',
  us10y: 'US 10Y',
};

export interface YahooSeries {
  symbol: string;
  /** Unix milliseconds, ascending, aligned 1:1 with `closes`. */
  ts: number[];
  closes: number[];
  /** Latest price from `meta`, which is fresher than the last daily close. */
  last: number;
  /** Previous close, for the 1-day change. */
  previousClose: number;
  currency: string;
}

interface ChartResponse {
  chart?: {
    result?: {
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: unknown;
  };
}

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Daily closes for one symbol. `range` accepts Yahoo's vocabulary (`1mo`, `6mo`,
 * `1y`, `2y`, `5y`). Cached for an hour: these are daily bars, and refetching
 * them faster buys nothing.
 */
export async function getSeries(symbol: string, range = '1y'): Promise<YahooSeries> {
  const j = await fetchJson<ChartResponse>(
    `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
    { revalidate: 3600 },
  );

  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`yahoo: no result for ${symbol}`);

  const rawTs = Array.isArray(r.timestamp) ? r.timestamp : [];
  const rawClose = Array.isArray(r.indicators?.quote?.[0]?.close)
    ? (r.indicators!.quote![0].close as (number | null)[])
    : [];

  const ts: number[] = [];
  const closes: number[] = [];
  const n = Math.min(rawTs.length, rawClose.length);
  for (let i = 0; i < n; i += 1) {
    const t = finite(rawTs[i]);
    const c = finite(rawClose[i]);
    // A null close is a market holiday or a halt, not a price of zero.
    if (t === null || c === null || c <= 0) continue;
    ts.push(t * 1000);
    closes.push(c);
  }

  // Below this there is nothing to compute a 30d correlation or z-score from.
  if (closes.length < 40) {
    throw new Error(`yahoo: ${symbol} returned ${closes.length} usable closes`);
  }

  const meta = r.meta ?? {};
  const last = finite(meta.regularMarketPrice) ?? closes[closes.length - 1];
  const previousClose =
    finite(meta.chartPreviousClose) ?? closes[Math.max(0, closes.length - 2)];

  return {
    symbol: typeof meta.symbol === 'string' ? meta.symbol : symbol,
    ts,
    closes,
    last,
    previousClose,
    currency: typeof meta.currency === 'string' ? meta.currency : 'USD',
  };
}

/**
 * Every macro symbol at once. Settled independently — one dead ticker costs that
 * row, not the panel. Returns only what resolved; the caller decides whether the
 * survivors are enough.
 */
export async function getMacroSeries(
  range = '1y',
): Promise<Partial<Record<YahooKey, YahooSeries>>> {
  const keys = Object.keys(YAHOO_SYMBOLS) as YahooKey[];
  const settled = await Promise.allSettled(
    keys.map((k) => getSeries(YAHOO_SYMBOLS[k], range)),
  );

  const out: Partial<Record<YahooKey, YahooSeries>> = {};
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') out[keys[i]] = res.value;
  });
  return out;
}
