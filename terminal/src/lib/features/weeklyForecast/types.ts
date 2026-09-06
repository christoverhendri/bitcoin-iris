export type ForecastDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface WeeklyForecastData {
  label: ForecastDirection;
  confidence: number;
  range: { min: number; max: number };
}

export interface WeeklyForecastArgs {
  symbol?: string;
}
