/**
 * The registry balance sweep, in one place.
 *
 * Two features need it — the flows panel and the supply hot/cold split — and
 * they must never disagree about the number. Both call this; Next's fetch cache
 * dedupes the underlying Esplora requests inside the revalidate window, so the
 * second caller in a render is free.
 *
 * One dead address must never sink the aggregate, so every lookup is settled
 * individually and failures are counted rather than thrown. `ok === 0` is the
 * genuine "no data" floor; anything above that is a usable, if partial, picture.
 */
import { EXCHANGE_ADDRESSES } from './exchangeRegistry';
import { getAddress } from '@/lib/sources/esplora';

export interface ReserveSweep {
  totalBtc: number;
  hotBtc: number;
  coldBtc: number;
  depositBtc: number;
  /** Addresses that resolved. */
  ok: number;
  /** Addresses whose lookup failed. */
  failed: number;
  exchangeCount: number;
}

export async function sweepRegistryBalances(): Promise<ReserveSweep> {
  const settled = await Promise.allSettled(
    EXCHANGE_ADDRESSES.map((a) => getAddress(a.address)),
  );

  const sweep: ReserveSweep = {
    totalBtc: 0,
    hotBtc: 0,
    coldBtc: 0,
    depositBtc: 0,
    ok: 0,
    failed: 0,
    exchangeCount: 0,
  };

  const exchanges = new Set<string>();

  settled.forEach((res, i) => {
    if (res.status !== 'fulfilled') {
      sweep.failed += 1;
      return;
    }
    const entry = EXCHANGE_ADDRESSES[i];
    const btc = Math.max(0, res.value.balanceBtc);
    sweep.ok += 1;
    sweep.totalBtc += btc;
    exchanges.add(entry.exchange);
    if (entry.kind === 'hot') sweep.hotBtc += btc;
    else if (entry.kind === 'cold') sweep.coldBtc += btc;
    else sweep.depositBtc += btc;
  });

  sweep.exchangeCount = exchanges.size;
  return sweep;
}
