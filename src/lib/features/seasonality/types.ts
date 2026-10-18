export interface SeasonalityCell {
  year: number;
  month: number;
  returnPct: number;
  /** The running, unfinished month: shown, but left out of averages and odds. */
  partial?: boolean;
}

export interface SeasonalityArgs {
  symbol?: string;
  years?: number;
}
