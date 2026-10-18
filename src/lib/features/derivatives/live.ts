/**
 * Live derivatives state, assembled from four independent public venues.
 *
 * Every upstream is fetched through `Promise.allSettled`: a derivatives page
 * that goes blank because Binance geo-blocked one request would be worse than a
 * page missing one row. We only give up — return `null`, which badges the panel
 * as mock — when the Bybit ticker *and* every funding venue failed, i.e. there
 * is no perp state at all left to show.
 */
import { getSpot } from '@/lib/sources/coinbase';
import {
  getBybitOiHistory,
  getBybitTicker,
  getBinanceFunding,
  getDeribitDvol,
  getDeribitOptions,
  getOkxFunding,
} from '@/lib/sources/derivatives';
import type { DerivativesArgs, DerivativesData, FundingPoint } from './types';

import { isStaleAge } from '@/lib/envelope';
import { MAX_AGE_SEC } from '@/lib/maxAge';

/** `Promise.allSettled` result -> value or null, so the assembly reads flat. */
const ok = <T>(r: PromiseSettledResult<T>): T | null =>
  r.status === 'fulfilled' ? r.value : null;

export async function fetchDerivatives(_args: DerivativesArgs) {
  void _args;

  const [tickerR, oiR, okxR, binanceR, dvolR, optionsR, spotR] = await Promise.allSettled([
    getBybitTicker(),
    getBybitOiHistory(48),
    getOkxFunding(),
    getBinanceFunding(),
    getDeribitDvol(7),
    getDeribitOptions(),
    getSpot('BTC-USD'),
  ]);

  const ticker = ok(tickerR);
  const oiHistory = ok(oiR) ?? [];
  const okx = ok(okxR);
  const binance = ok(binanceR);
  const dvolHistory = ok(dvolR) ?? [];
  const options = ok(optionsR);
  const spot = ok(spotR);

  const fundingBySource: FundingPoint[] = [];
  if (ticker) fundingBySource.push({ source: 'BYBIT', rate: ticker.fundingRate });
  if (okx !== null) fundingBySource.push({ source: 'OKX', rate: okx.rate });
  if (binance) fundingBySource.push({ source: 'BINANCE', rate: binance.fundingRate });

  // No perp ticker and no funding anywhere: nothing real is left to render.
  if (!ticker && fundingBySource.length === 0) return null;

  const fundingRate = fundingBySource.length
    ? fundingBySource.reduce((s, f) => s + f.rate, 0) / fundingBySource.length
    : 0;

  const oiChange24hPct =
    oiHistory.length >= 2 && oiHistory[0].oi > 0
      ? ((oiHistory[oiHistory.length - 1].oi - oiHistory[0].oi) / oiHistory[0].oi) * 100
      : 0;

  const dvol = dvolHistory.length ? dvolHistory[dvolHistory.length - 1].close : 0;
  // DVOL has its own limit (hourly index, 3h). Computed here, server-side, so the
  // panel can badge it without reading the clock during render.
  const dvolAgeSec = dvolHistory.length
    ? Math.max(0, Math.round((Date.now() - dvolHistory[dvolHistory.length - 1].ts) / 1000))
    : null;
  const dvolStale = isStaleAge(dvolAgeSec, MAX_AGE_SEC.dvol);
  const dvolChange7dPct =
    dvolHistory.length >= 2 && dvolHistory[0].close > 0
      ? ((dvol - dvolHistory[0].close) / dvolHistory[0].close) * 100
      : 0;

  // Mark from the perp we have; spot from Coinbase, falling back to the venue's
  // own index price when Coinbase itself is the thing that failed.
  const mark = ticker?.markPrice ?? binance?.markPrice ?? 0;
  const spotPrice = spot?.price ?? ticker?.indexPrice ?? binance?.indexPrice ?? 0;
  const basisPct = mark > 0 && spotPrice > 0 ? ((mark - spotPrice) / spotPrice) * 100 : 0;

  const openInterestBtc =
    ticker?.openInterestBtc ?? (oiHistory.length ? oiHistory[oiHistory.length - 1].oi : 0);

  const data: DerivativesData = {
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
    dvolAgeSec,
    dvolStale,
    spot: spotPrice || options?.underlying || 0,
    putCallRatio: options?.putCallRatio ?? 0,
    totalOptionOi: options?.totalOi ?? 0,
    maxPainStrike: options?.maxPainStrike ?? 0,
  };

  // Age of the panel = its OLDEST core reading (perp ticker, each funding venue,
  // spot). Basis compares perp with spot, so if either side is old the whole
  // reading is; a cached response from a blocked venue must not look current.
  const spotMs = spot?.time ? Date.parse(spot.time) : null;
  const coreTimes = [ticker?.time, okx?.time, binance?.time, spotMs].filter(
    (t): t is number => typeof t === 'number' && Number.isFinite(t),
  );
  const asOf = coreTimes.length > 0 ? new Date(Math.min(...coreTimes)).toISOString() : null;

  return { data, asOf, synthetic: false };
}
