/**
 * Live global-markets context — the dollar, equities, the vol complex, the long
 * bond, gold — and how each has moved with BTC over the last month.
 *
 * This is the keyless half of macro. FRED still owns the statistical releases
 * (CPI, policy rate, GDP) on `/macro/data`; nothing here substitutes for those.
 *
 * The correlation is computed over the calendar days both series traded, not by
 * zipping arrays: equities trade ~252 sessions a year and BTC trades 365, so
 * index-pairing silently compares a Tuesday with a Saturday and every number
 * after the first missing session is wrong while still looking reasonable.
 */
import { getMacroSeries, YAHOO_LABEL, YAHOO_SYMBOLS, type YahooKey } from '@/lib/sources/yahoo';
import { getDailyCloses } from '@/lib/sources/coingecko';
import { correlateDaily, zScore, type DatedPoint } from '@/lib/quant/correlation';
import type { MacroMarketsArgs, MacroMarketsData, MarketKind, MarketSeries } from './types';

const KIND: Record<YahooKey, MarketKind> = {
  dxy: 'currency',
  spx: 'index',
  vix: 'index',
  gold: 'commodity',
  us10y: 'rate',
};

/** Percent change between the latest close and the one `back` sessions earlier. */
function changePct(closes: number[], back: number): number {
  if (closes.length <= back) return 0;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - back];
  if (!(then > 0)) return 0;
  return (now / then - 1) * 100;
}

export async function fetchMacroMarkets({ range = '1y' }: MacroMarketsArgs) {
  const [markets, btcClosesR] = await Promise.all([
    getMacroSeries(range),
    // BTC's own daily closes, the correlation's other leg.
    getDailyCloses(365).catch(() => null),
  ]);

  const keys = Object.keys(YAHOO_SYMBOLS) as YahooKey[];
  const missing = keys.filter((k) => !markets[k]).map((k) => YAHOO_SYMBOLS[k]);

  // Every symbol failed — Yahoo is unreachable. Say "no data" honestly.
  if (missing.length === keys.length) return null;

  // CoinGecko hands back seconds; `alignByDate` keys on `new Date(ts)` and would
  // silently map every one of them to 1970 — producing an empty intersection and
  // a confident `null` correlation — if this conversion were missed.
  const btcPoints: DatedPoint[] = (btcClosesR ?? []).map((c) => ({
    ts: c.ts * 1000,
    close: c.close,
  }));

  const series: MarketSeries[] = [];
  for (const key of keys) {
    const s = markets[key];
    if (!s) continue;

    const points = s.ts.map((ts, i) => ({ ts, close: s.closes[i] }));
    const corr =
      btcPoints.length > 0
        ? correlateDaily(points, btcPoints, 30)
        : { r: null, sessions: 0 };

    // 1-day change uses `meta.previousClose`, which is fresher than the last
    // daily bar during a session.
    const change1dPct =
      s.previousClose > 0 ? (s.last / s.previousClose - 1) * 100 : 0;

    series.push({
      key,
      symbol: YAHOO_SYMBOLS[key],
      label: YAHOO_LABEL[key],
      kind: KIND[key],
      currency: s.currency,
      level: s.last,
      change1dPct,
      change5dPct: changePct(s.closes, 5),
      change30dPct: changePct(s.closes, 30),
      corr30d: corr.r,
      corrSessions: corr.sessions,
      z1y: zScore(s.closes),
      points,
    });
  }

  if (series.length === 0) return null;

  const data: MacroMarketsData = {
    series,
    btcSessions: btcPoints.length,
    missing,
  };

  const newest = series.reduce(
    (m, s) => Math.max(m, s.points[s.points.length - 1]?.ts ?? 0),
    0,
  );

  return {
    data,
    asOf: new Date(newest > 0 ? newest : Date.now()).toISOString(),
    synthetic: false,
  };
}
