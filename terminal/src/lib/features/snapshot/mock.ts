import { seeded } from '@/lib/rng';
import type { BtcSnapshot, SnapshotArgs } from './types';

/**
 * Placeholder snapshot. Same field names, same types, same order of magnitude
 * as the real thing — deterministic per UTC day so SSR and hydration agree.
 *
 * Components never import this. It is reached only through `defineFeature`,
 * which wraps it in an envelope flagged `isMock`.
 */
export function mockSnapshot({ symbol }: SnapshotArgs): BtcSnapshot {
  const r = seeded(`snapshot|${symbol}`);

  const last = 112_420.35 + (r() - 0.5) * 1_500;
  const change24hPct = (r() - 0.35) * 5;
  const change24hAbs = last * (change24hPct / 100);
  const circulating = 19.77e6;

  return {
    last,
    change24hAbs,
    change24hPct,
    high24h: last * (1 + 0.016 * r()),
    low24h: last * (1 - 0.024 * r()),
    return7dPct: 5.82 + (r() - 0.5) * 3,
    return30dPct: 12.43 + (r() - 0.5) * 6,
    volume24hUsd: 42.8e9 * (0.85 + 0.3 * r()),
    marketCapUsd: last * circulating,
    dominancePct: 52.6 + (r() - 0.5) * 2,
    realizedVol30dPct: 18.72 + (r() - 0.5) * 4,
  };
}
