/**
 * Placeholder derivatives state. Same shape as `live.ts`, deterministic for a
 * given UTC day so SSR and hydration agree — no `Math.random`, no `Date.now`.
 * Timestamps are laid out backwards from a fixed midnight-of-today anchor.
 */
import { between, seeded, utcDay } from '@/lib/rng';
import type { DerivativesArgs, DerivativesData, FundingPoint } from './types';

const HOUR = 3_600_000;

export function mockDerivatives({ symbol = 'BTC' }: DerivativesArgs): DerivativesData {
  const r = seeded(`derivatives_${symbol}`);
  const anchor = Date.parse(`${utcDay()}T00:00:00Z`);

  // Funding: ±0.03% per period, with each venue drifting a little around it.
  const base = between(r, -0.0003, 0.0003);
  const fundingBySource: FundingPoint[] = ['BYBIT', 'OKX', 'BINANCE'].map((source) => ({
    source,
    rate: base + between(r, -0.00004, 0.00004),
  }));
  const fundingRate = fundingBySource.reduce((s, f) => s + f.rate, 0) / fundingBySource.length;

  // Open interest: 40–70k BTC on a gentle 48h walk.
  const oiStart = between(r, 40_000, 70_000);
  const oiHistory: { ts: number; oi: number }[] = [];
  let oi = oiStart;
  for (let i = 47; i >= 0; i--) {
    oi = oi * (1 + between(r, -0.006, 0.006));
    oiHistory.push({ ts: anchor - i * HOUR, oi });
  }
  const openInterestBtc = oiHistory[oiHistory.length - 1].oi;
  const oiChange24hPct = ((openInterestBtc - oiHistory[0].oi) / oiHistory[0].oi) * 100;

  // DVOL: 35–60 vol points over a 7d hourly series.
  const dvolStart = between(r, 35, 60);
  const dvolHistory: { ts: number; close: number }[] = [];
  let d = dvolStart;
  for (let i = 167; i >= 0; i--) {
    d = Math.max(10, d * (1 + between(r, -0.008, 0.008)));
    dvolHistory.push({ ts: anchor - i * HOUR, close: d });
  }
  const dvol = dvolHistory[dvolHistory.length - 1].close;
  const dvolChange7dPct = ((dvol - dvolHistory[0].close) / dvolHistory[0].close) * 100;

  const spot = between(r, 60_000, 110_000);
  const basisPct = between(r, -0.15, 0.25);

  return {
    fundingRate,
    fundingBySource,
    fundingAnnualizedPct: fundingRate * 3 * 365 * 100,
    openInterestBtc,
    oiChange24hPct,
    oiHistory,
    basisPct,
    dvol,
    dvolChange7dPct,
    dvolHistory,
    spot,
    putCallRatio: between(r, 0.6, 1.2),
    totalOptionOi: between(r, 200_000, 400_000),
    maxPainStrike: Math.round((spot * (1 + between(r, -0.08, 0.08))) / 1000) * 1000,
  };
}
