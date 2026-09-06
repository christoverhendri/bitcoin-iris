export interface MacroMetric {
  country: string;
  cpi: number;
  rate: number;
  growth: number;
  inflation: number;
  zScores: {
    cpi: number;
    rate: number;
    growth: number;
    inflation: number;
  };
}

export interface MacroCountryArgs {
  countries?: string[];
}
