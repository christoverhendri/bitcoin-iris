import type { SentimentAnalysis } from '@/lib/sentiment/types';

export interface SentimentData {
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  score: number;
  analysis?: SentimentAnalysis;
}

export interface SentimentArgs {
  days?: number;
}
