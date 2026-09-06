/** One venue's current per-period funding rate, as a decimal fraction. */
export interface FundingPoint {
  source: string;
  rate: number;
}

export interface DerivativesData {
  /** Simple mean of the venues that answered. Decimal fraction, per 8h period. */
  fundingRate: number;
  fundingBySource: FundingPoint[];
  /** `rate * 3 * 365 * 100` — three 8h periods a day, compounding ignored. */
  fundingAnnualizedPct: number;
  openInterestBtc: number;
  oiChange24hPct: number;
  oiHistory: { ts: number; oi: number }[];
  /** `(perpMark - spot) / spot * 100`. Perp premium over Coinbase spot. */
  basisPct: number;
  /** Deribit DVOL — 30d forward-looking implied volatility, in vol points. */
  dvol: number;
  dvolChange7dPct: number;
  dvolHistory: { ts: number; close: number }[];
  /**
   * Spot reference the basis and the max-pain gap are measured against.
   * Added beyond the perp/option fields because the options panel has to show
   * max pain *relative to* spot, and deriving it back out of `basisPct` would
   * be a lossy round-trip.
   */
  spot: number;
  putCallRatio: number;
  totalOptionOi: number;
  maxPainStrike: number;
}

export interface DerivativesArgs {
  symbol?: string;
}
