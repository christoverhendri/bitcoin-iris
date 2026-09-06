/**
 * The BTC SNAPSHOT panel and the topbar ticker.
 *
 * This shape is the contract between the live reader and the mock generator.
 * Both import it; neither may add a field the other lacks.
 */
export interface BtcSnapshot {
  last: number;
  change24hAbs: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  return7dPct: number;
  return30dPct: number;
  volume24hUsd: number;
  marketCapUsd: number;
  dominancePct: number;
  realizedVol30dPct: number;
}

export interface SnapshotArgs {
  symbol: string;
}
