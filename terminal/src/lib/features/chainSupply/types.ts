export interface ChainSupplyMetrics {
  activeAddresses: number;
  /**
   * BTC transferred on-chain in the last 24h, from Blockchair. `null` when that
   * one call failed — the rest of the panel does not depend on it, and a zero
   * would read as a measurement of a chain that saw no transfers all day.
   *
   * Replaces a `newAddresses` field computed as 6% of active addresses — a made
   * up constant rendered as if it were measured. No keyless source publishes a
   * first-seen-address series, so the slot now holds something that is.
   */
  volume24hBtc: number | null;
  txCount: number;
  hashRate: number;
  coldPct: number;
  hotPct: number;
}

export interface ChainSupplyArgs {
  symbol?: string;
}
