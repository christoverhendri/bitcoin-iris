/** What kind of number this instrument quotes — drives unit formatting. */
export type MarketKind = 'index' | 'rate' | 'commodity' | 'currency';

export interface MarketSeries {
  key: string;
  /** Yahoo symbol in plain form, e.g. `^GSPC`. */
  symbol: string;
  label: string;
  kind: MarketKind;
  currency: string;

  level: number;
  change1dPct: number;
  change5dPct: number;
  change30dPct: number;

  /**
   * Pearson correlation of the last 30 daily returns against BTC's, computed
   * over the calendar days both series actually traded. `null` when fewer than
   * 30 sessions overlap — a correlation from eleven points is not a 30-day
   * correlation and will not be presented as one.
   */
  corr30d: number | null;
  /** Overlapping sessions the correlation was computed from. */
  corrSessions: number;

  /**
   * Where the current level sits within this series' own trailing year, in
   * standard deviations. A rank inside that year — not a valuation.
   */
  z1y: number | null;

  /** Closes for the sparkline, oldest first. */
  points: { ts: number; close: number }[];
}

export interface MacroMarketsData {
  series: MarketSeries[];
  /** BTC sessions the correlations were measured against. */
  btcSessions: number;
  /** Symbols requested that did not come back. Rendered, never hidden. */
  missing: string[];
}

export interface MacroMarketsArgs {
  /** Yahoo range vocabulary. Default `1y`. */
  range?: string;
}
