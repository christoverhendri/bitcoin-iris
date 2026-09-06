/**
 * Projects classified on-chain flows onto the global event map.
 *
 * A whale deposit is a market event with a location — the exchange's operating
 * base — in exactly the way a regulator's announcement is. Putting them on the
 * same map lets a reader see, in one glance, that the sell-side pressure showing
 * up in Dubai is on-chain and the pressure in Washington is regulatory.
 *
 * The coupling is kept here, in `lib/onchain`, and joined at the page level.
 * `geopoliticalEvents/live.ts` deliberately does not know this file exists: a
 * feature reader that fetched another feature would make both untestable and
 * would double the failure surface of a page that currently degrades cleanly.
 *
 * The coordinates are corporate headquarters, not the physical location of the
 * coins — which have none. They are a legible anchor, not a claim.
 */
import { hashString } from '@/lib/rng';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents/types';
import type { FlowTransfer } from '@/lib/features/chainFlows/types';
import { FLOW_KIND_LABEL, type FlowBias } from './classifyFlow';

export interface ExchangeHq {
  lat: number;
  lon: number;
  iso2: string;
  place: string;
}

/** Operating base per tracked exchange. Keys match `exchangeRegistry.exchange`. */
export const EXCHANGE_HQ: Record<string, ExchangeHq> = {
  Binance: { lat: 25.2048, lon: 55.2708, iso2: 'AE', place: 'Dubai' },
  Coinbase: { lat: 37.7749, lon: -122.4194, iso2: 'US', place: 'San Francisco' },
  Bitfinex: { lat: 22.3193, lon: 114.1694, iso2: 'HK', place: 'Hong Kong' },
  Kraken: { lat: 37.7749, lon: -122.4194, iso2: 'US', place: 'San Francisco' },
  OKX: { lat: 1.3521, lon: 103.8198, iso2: 'SG', place: 'Singapore' },
  Bybit: { lat: 25.2048, lon: 55.2708, iso2: 'AE', place: 'Dubai' },
  Bitstamp: { lat: 49.6116, lon: 6.1319, iso2: 'LU', place: 'Luxembourg' },
  Robinhood: { lat: 37.4530, lon: -122.1817, iso2: 'US', place: 'Menlo Park' },
};

const SENTIMENT_BY_BIAS: Record<FlowBias, GeoEvent['sentiment']> = {
  // A bullish flow (coins leaving the order book) is a positive event.
  bullish: 'positive',
  bearish: 'negative',
  neutral: 'neutral',
};

const btc = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(2)}K BTC` : `${Math.round(n).toLocaleString('en-US')} BTC`;

/**
 * Map transfers to map markers. Transfers whose exchange has no HQ entry — an
 * inter-exchange route label, or an exchange added to the registry without a
 * location — are dropped rather than placed at a made-up coordinate.
 */
export function flowsToGeoEvents(transfers: FlowTransfer[]): GeoEvent[] {
  // Unconfirmed transfers carry no block time. Rather than stamping them with a
  // clock read (which would break mock determinism) they inherit the newest
  // confirmed time in the batch — they are, after all, at least that recent.
  const newest = transfers.reduce((m, t) => Math.max(m, t.blockTime), 0);

  const out: GeoEvent[] = [];
  for (const t of transfers) {
    const hq = EXCHANGE_HQ[t.exchange];
    if (!hq) continue;
    out.push({
      id: `flow-${hashString(t.txid).toString(36)}`,
      headline: `${btc(t.amountBtc)} · ${FLOW_KIND_LABEL[t.kind]} · ${t.fromLabel} → ${t.toLabel}`,
      source: 'ON-CHAIN',
      url: `https://blockstream.info/tx/${t.txid}`,
      publishedAt: (t.blockTime > 0 ? t.blockTime : newest) * 1000,
      category: 'WHALE_FLOW',
      sentiment: SENTIMENT_BY_BIAS[t.bias],
      lat: hq.lat,
      lon: hq.lon,
      iso2: hq.iso2,
      place: `${hq.place} · ${t.exchange}`,
      impact: t.impact,
    });
  }
  return out;
}
