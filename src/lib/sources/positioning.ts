/**
 * Crowd positioning — who is leaning which way, and how hard.
 *
 * The derivatives panel already answers "what does leverage cost" (funding,
 * open interest, basis, implied vol). It does not answer "who is on which
 * side", which is the question that turns a funding print into a trade idea.
 * Binance publishes three keyless views of exactly that, and the gap between
 * them is the signal:
 *
 *   globalLongShortAccountRatio  every account, one vote each  -> RETAIL
 *   topLongShortPositionRatio    largest accounts, by position -> WHALES
 *   takerlongshortRatio          market orders lifting/hitting -> AGGRESSION
 *
 * When retail sits at 1.08 long/short while top traders sit at 2.10, the two
 * cohorts disagree, and historically the larger book has been the better guess.
 * That reading is a heuristic, not a law; `docs/DECISIONS.md` records it as
 * opinion.
 *
 * The Coinbase Premium is here for the same reason: it is the cheapest honest
 * proxy for US spot demand. Coinbase's book is where American institutions
 * transact; Binance's is where the offshore crowd does. A persistent positive
 * gap means the American bid is paying up.
 *
 * Everything below is keyless. All functions throw on a bad response.
 */
import { fetchJson } from './http';
import { getSpot as getCoinbaseSpot } from './coinbase';

const FAPI = 'https://fapi.binance.com/futures/data';
const BINANCE_SPOT = 'https://api.binance.com/api/v3/ticker/price';

/** One observation of a long/short cohort. */
export interface RatioPoint {
  ts: number;
  /** Longs divided by shorts. 1.0 is balanced. */
  ratio: number;
  /** Share of the cohort that is long, 0-1. */
  longShare: number;
}

interface RawRatioRow {
  longAccount?: string;
  shortAccount?: string;
  longShortRatio?: string;
  timestamp?: number;
}

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toRatioPoints(rows: unknown, what: string): RatioPoint[] {
  if (!Array.isArray(rows)) throw new Error(`binance: ${what} did not return an array`);
  const out: RatioPoint[] = [];
  for (const r of rows as RawRatioRow[]) {
    const ts = finite(r?.timestamp);
    const ratio = finite(r?.longShortRatio);
    const longShare = finite(r?.longAccount);
    if (ts === null || ratio === null || longShare === null || ratio <= 0) continue;
    out.push({ ts, ratio, longShare });
  }
  if (out.length === 0) throw new Error(`binance: ${what} returned no usable rows`);
  return out.sort((a, b) => a.ts - b.ts);
}

/**
 * `period` follows Binance's vocabulary (`5m`,`15m`,`30m`,`1h`,`2h`,`4h`,`1d`).
 * The endpoint caps history at 30 days regardless of `limit`.
 */
export async function getRetailRatio(period = '1h', limit = 48): Promise<RatioPoint[]> {
  const rows = await fetchJson<unknown>(
    `${FAPI}/globalLongShortAccountRatio?symbol=BTCUSDT&period=${period}&limit=${limit}`,
    { revalidate: 300 },
  );
  return toRatioPoints(rows, 'globalLongShortAccountRatio');
}

/** Top traders by position size — the large-book cohort. */
export async function getTopTraderRatio(period = '1h', limit = 48): Promise<RatioPoint[]> {
  const rows = await fetchJson<unknown>(
    `${FAPI}/topLongShortPositionRatio?symbol=BTCUSDT&period=${period}&limit=${limit}`,
    { revalidate: 300 },
  );
  return toRatioPoints(rows, 'topLongShortPositionRatio');
}

/** Aggressive flow: volume that crossed the spread, split by side. */
export interface TakerPoint {
  ts: number;
  buyVol: number;
  sellVol: number;
  /** buyVol / sellVol. Above 1 means buyers are lifting offers. */
  ratio: number;
}

interface RawTakerRow {
  buySellRatio?: string;
  buyVol?: string;
  sellVol?: string;
  timestamp?: number;
}

export async function getTakerFlow(period = '1h', limit = 48): Promise<TakerPoint[]> {
  const rows = await fetchJson<unknown>(
    `${FAPI}/takerlongshortRatio?symbol=BTCUSDT&period=${period}&limit=${limit}`,
    { revalidate: 300 },
  );
  if (!Array.isArray(rows)) throw new Error('binance: takerlongshortRatio did not return an array');

  const out: TakerPoint[] = [];
  for (const r of rows as RawTakerRow[]) {
    const ts = finite(r?.timestamp);
    const buyVol = finite(r?.buyVol);
    const sellVol = finite(r?.sellVol);
    const ratio = finite(r?.buySellRatio);
    if (ts === null || buyVol === null || sellVol === null || ratio === null) continue;
    out.push({ ts, buyVol, sellVol, ratio });
  }
  if (out.length === 0) throw new Error('binance: takerlongshortRatio returned no usable rows');
  return out.sort((a, b) => a.ts - b.ts);
}

/** Binance spot BTCUSDT — the offshore reference leg of the premium. */
export async function getBinanceSpot(): Promise<number> {
  const j = await fetchJson<{ price?: string }>(`${BINANCE_SPOT}?symbol=BTCUSDT`, {
    revalidate: 60,
  });
  const p = finite(j?.price);
  if (p === null || p <= 0) throw new Error('binance: unusable spot price');
  return p;
}

export interface CoinbasePremium {
  coinbaseUsd: number;
  binanceUsd: number;
  /** Percent. Positive = Coinbase trading above Binance. */
  premiumPct: number;
  /** Absolute USD gap, signed. */
  spreadUsd: number;
}

/**
 * Coinbase Premium Index.
 *
 * One caveat worth stating: Binance quotes BTC in USDT, not dollars. When USDT
 * drifts off its peg part of this "premium" is really a stablecoin discount.
 * The metric is still read this way industry-wide, and the drift is small
 * relative to the moves that matter, but it is not a pure USD/USD comparison.
 */
export async function getCoinbasePremium(): Promise<CoinbasePremium> {
  const [cb, bn] = await Promise.all([getCoinbaseSpot('BTC-USD'), getBinanceSpot()]);
  const coinbaseUsd = cb.price;
  if (!Number.isFinite(coinbaseUsd) || coinbaseUsd <= 0) {
    throw new Error('coinbase: unusable spot price');
  }
  return {
    coinbaseUsd,
    binanceUsd: bn,
    premiumPct: ((coinbaseUsd - bn) / bn) * 100,
    spreadUsd: coinbaseUsd - bn,
  };
}
