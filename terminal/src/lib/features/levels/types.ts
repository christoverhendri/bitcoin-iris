export interface SupportResistanceLevels {
  r2: number;
  r1: number;
  vwap: number;
  s1: number;
  s2: number;
}

export interface LevelsArgs {
  symbol?: string;
  /** Candle interval to derive pivots from — follows the active timeframe. */
  interval?: string;
  /** How many candles the timeframe wants; caps the pivot/vwap window. */
  limit?: number;
}
