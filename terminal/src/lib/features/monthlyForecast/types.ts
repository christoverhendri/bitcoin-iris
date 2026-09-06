export interface MonthlyForecastPath {
  p10: number;
  p50: number;
  p90: number;
  pathPct: number[];
}

export interface MonthlyForecastArgs {
  symbol?: string;
  simulations?: number;
}
