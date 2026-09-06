/**
 * Live-ish chain supply / activity metrics from keyless blockchain.info.
 *
 * Partial live, and labelled as such:
 *   - hashRate, activeAddresses, txCount  -> real, from blockchain.info
 *   - volume24hBtc                        -> real, from Blockchair
 *   - coldPct / hotPct                    -> real, measured across the tracked
 *                                            exchange registry (a subset)
 *
 * Everything on this panel is now measured. It previously carried a
 * `newAddresses` figure derived as 6% of active addresses, which no source
 * supports; it was removed rather than badged, on the same reasoning that keeps
 * Indonesian macro blank.
 *
 * Returns `null` only when hash rate AND both chart series fail — that is the
 * genuine "no data" floor. A partial upstream failure throws, so `defineFeature`
 * falls back to the badged mock rather than showing half-real numbers.
 */
import {
  getHashRateGHs,
  getChartLatest,
} from '@/lib/sources/blockchainInfo';
import { getChainStats } from '@/lib/sources/blockchair';
import { sweepRegistryBalances } from '@/lib/onchain/reserves';
import type { ChainSupplyMetrics, ChainSupplyArgs } from './types';

export async function fetchChainSupply(_args: ChainSupplyArgs) {
  void _args;

  const [hr, uniq, tx, sweep, stats] = await Promise.allSettled([
    getHashRateGHs(),
    getChartLatest('n-unique-addresses'),
    getChartLatest('n-transactions'),
    sweepRegistryBalances(),
    getChainStats(),
  ]);

  const anyOk =
    hr.status === 'fulfilled' ||
    uniq.status === 'fulfilled' ||
    tx.status === 'fulfilled';
  if (!anyOk) return null;

  if (hr.status !== 'fulfilled' || uniq.status !== 'fulfilled' || tx.status !== 'fulfilled') {
    throw new Error('chainSupply: partial blockchain.info failure — falling back to mock');
  }

  // blockchain.info returns GH/s; 1 EH/s = 1e9 GH/s.
  const hashRate = hr.value / 1e9;

  const activeAddresses = Math.round(uniq.value.latest);

  // Blockchair is a supplement, not load-bearing: it supplies one field, and its
  // outage costs that field rather than the panel. `null`, not 0 — a zero here
  // would render as a measurement of a chain that moved nothing all day.
  const volume24hBtc = stats.status === 'fulfilled' ? stats.value.volume24hBtc : null;

  const txCount = Math.round(tx.value.latest);

  // TRACKED SUBSET, not the whole market: the cold/hot split is measured live
  // across the curated exchange registry (see `lib/onchain/exchangeRegistry`),
  // which sees fifteen addresses out of the thousands exchanges actually use.
  // It is a real measurement of a sample, never a figure for "all exchange BTC".
  // If the sweep is unusable, the split is reported as zero rather than guessed.
  let coldPct = 0;
  let hotPct = 0;
  if (sweep.status === 'fulfilled' && sweep.value.ok > 0) {
    const tracked = sweep.value.coldBtc + sweep.value.hotBtc + sweep.value.depositBtc;
    if (tracked > 0) {
      coldPct = (sweep.value.coldBtc / tracked) * 100;
      // Deposit wallets are liquid, customer-facing balance — they belong with
      // hot, not cold, for a liquidity read.
      hotPct = ((sweep.value.hotBtc + sweep.value.depositBtc) / tracked) * 100;
    }
  }

  const newestTs = Math.max(uniq.value.ts, tx.value.ts);
  const asOf = new Date(newestTs).toISOString();

  const data: ChainSupplyMetrics = {
    activeAddresses,
    volume24hBtc,
    txCount,
    hashRate,
    coldPct,
    hotPct,
  };

  return { data, asOf, synthetic: false };
}
