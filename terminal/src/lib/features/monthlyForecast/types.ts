export interface MonthlyForecastPath {
  p10: number | null;
  p50: number | null;
  p90: number | null;
  pathPct?: number[];
  method?: string;
  origin?: string;
  provenance?: string;
  endpointOnly?: boolean;
  horizonDays?: number;
  targetEnd?: string;
}

export interface MonthlyForecastArgs {
  symbol?: string;
  simulations?: number;
}
