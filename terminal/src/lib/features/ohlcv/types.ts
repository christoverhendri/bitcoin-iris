export interface OhlcvCandle {
  symbol: string;
  interval: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvArgs {
  symbol?: string;
  interval?: string;
  limit?: number;
}
