export interface IndicatorData {
  rsi: number;
  macd: number;
  macdSignal: number;
  ema5: number;
  ema8: number;
  ema13: number;
  ema21: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
}

export interface IndicatorArgs {
  symbol?: string;
  /** Candle interval to compute on, e.g. '1h' or '1d'. Driven by `?tf=`. */
  interval?: string;
  /** How many candles to pull. Clamped up internally so the MAs have runway. */
  limit?: number;
}
