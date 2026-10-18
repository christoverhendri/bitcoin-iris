import type { SentimentAnalysis } from '@/lib/sentiment/types';

export interface SentimentData {
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  /** Headlines the percentages are taken over. */
  headlineCount: number;
  /** Which engine labelled the headlines (model, baseline or heuristic fallback). */
  analysis?: SentimentAnalysis;
}

export interface SentimentArgs {
  days?: number;
}
