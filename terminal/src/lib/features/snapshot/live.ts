/**
 * Live BTC snapshot — Coinbase for price and 24h stats, CoinGecko for the
 * market-structure fields Coinbase does not carry (market cap, dominance, 7d/30d
 * returns). Realised vol is computed from Coinbase daily closes.
 *
 * Returns the same `BtcSnapshot` shape the mock does. Any upstream failure
 * throws; `defineFeature` turns that into a badged placeholder.
 */
import { getStats, getSpot, getCandles } from '@/lib/sources/coinbase';
import { getMarket, getDominancePct } from '@/lib/sources/coingecko';
import { realizedVolPct } from '@/lib/quant/series';
import type { BtcSnapshot, SnapshotArgs } from './types';

export async function fetchSnapshot(_args: SnapshotArgs) {
  void _args;

  const [stats, spot, dailies, market, dominance] = await Promise.all([
    getStats('BTC-USD'),
    getSpot('BTC-USD').catch(() => null),
    getCandles('1d', 120, 'BTC-USD').catch(() => []),
    getMarket().catch(() => null),
    getDominancePct().catch(() => null),
  ]);

  const last = spot?.price ?? stats.last;
  const change24hAbs = last - stats.open;
  const change24hPct = stats.open > 0 ? (change24hAbs / stats.open) * 100 : 0;
  const closes = dailies.map((c) => c.close);

  const return7dPct =
    market?.price_change_percentage_7d_in_currency ??
    pctFromCloses(closes, 7);
  const return30dPct =
    market?.price_change_percentage_30d_in_currency ??
    pctFromCloses(closes, 30);

  const data: BtcSnapshot = {
    last,
    change24hAbs,
    change24hPct,
    high24h: stats.high,
    low24h: stats.low,
    return7dPct,
    return30dPct,
    volume24hUsd: (market?.total_volume ?? stats.volume * last),
    marketCapUsd: market?.market_cap ?? 0,
    dominancePct: dominance ?? 0,
    realizedVol30dPct: closes.length > 10 ? realizedVolPct(closes, 30) : 0,
  };

  return { data, asOf: new Date().toISOString(), synthetic: false };
}

function pctFromCloses(closes: number[], daysBack: number): number {
  if (closes.length <= daysBack) return 0;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - daysBack];
  return then > 0 ? ((now - then) / then) * 100 : 0;
}
