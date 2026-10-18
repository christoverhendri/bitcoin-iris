import { dateSeed, mulberry32, utcDay } from '@/lib/rng';
import { zScore } from '@/lib/quant/correlation';
import { YAHOO_LABEL, YAHOO_SYMBOLS, type YahooKey } from '@/lib/sources/yahoo';
import type { MacroMarketsArgs, MacroMarketsData, MarketKind, MarketSeries } from './types';

const DAY_MS = 86_400_000;
const SESSIONS = 260;

const KIND: Record<YahooKey, MarketKind> = {
  dxy: 'currency',
  spx: 'index',
  vix: 'index',
  gold: 'commodity',
  us10y: 'rate',
};

/** Plausible starting levels and daily volatility per instrument. */
const PROFILE: Record<YahooKey, { start: number; vol: number; corr: number }> = {
  dxy: { start: 99, vol: 0.004, corr: -0.42 },
  spx: { start: 6100, vol: 0.009, corr: 0.55 },
  vix: { start: 15, vol: 0.06, corr: -0.38 },
  gold: { start: 3400, vol: 0.011, corr: 0.18 },
  us10y: { start: 4.2, vol: 0.015, corr: -0.21 },
};

export function mockMacroMarkets(_args: MacroMarketsArgs): MacroMarketsData {
  void _args;
  const rand = mulberry32(dateSeed('macroMarkets'));
  // Seeded off the UTC day, never `Date.now()`, so SSR and hydration agree.
  const anchor = Date.parse(`${utcDay()}T00:00:00.000Z`);

  const keys = Object.keys(YAHOO_SYMBOLS) as YahooKey[];

  const series: MarketSeries[] = keys.map((key) => {
    const p = PROFILE[key];
    const closes: number[] = [];
    const points: { ts: number; close: number }[] = [];
    let v = p.start;
    for (let i = SESSIONS - 1; i >= 0; i -= 1) {
      v = Math.max(p.start * 0.4, v * (1 + (rand() - 0.5) * p.vol * 2));
      closes.push(v);
      points.push({ ts: anchor - i * DAY_MS, close: v });
    }

    const level = closes[closes.length - 1];
    const chg = (back: number) =>
      closes.length > back && closes[closes.length - 1 - back] > 0
        ? (level / closes[closes.length - 1 - back] - 1) * 100
        : 0;

    return {
      key,
      symbol: YAHOO_SYMBOLS[key],
      label: YAHOO_LABEL[key],
      kind: KIND[key],
      currency: 'USD',
      level,
      change1dPct: chg(1),
      change5dPct: chg(5),
      change30dPct: chg(30),
      // A fixed plausible correlation per instrument, nudged a little, rather
      // than one computed from two unrelated random walks — which would be ~0
      // for everything and teach the reader nothing about the panel's shape.
      corr30d: Math.max(-1, Math.min(1, p.corr + (rand() - 0.5) * 0.2)),
      corrSessions: 30,
      // Placeholder history: the fixed correlation with a slow deterministic wobble.
      rollingCorr30d: points.slice(30).map((pt, j) => ({
        ts: pt.ts,
        r: Math.max(-1, Math.min(1, p.corr + Math.sin(j / 9) * 0.25)),
      })),
      z1y: zScore(closes),
      points,
    };
  });

  return { series, btcSessions: SESSIONS, missing: [] };
}
