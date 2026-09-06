export interface SentimentData {
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  score: number;
}

export interface SentimentArgs {
  days?: number;
}
