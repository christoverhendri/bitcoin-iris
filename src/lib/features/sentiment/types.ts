export interface SentimentData {
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  /** Headlines the percentages are taken over. */
  headlineCount: number;
}

export interface SentimentArgs {
  days?: number;
}
