export interface SeasonalityCell {
  year: number;
  month: number;
  returnPct: number;
}

export interface SeasonalityArgs {
  symbol?: string;
  years?: number;
}
