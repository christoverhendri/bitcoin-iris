export type SentimentLabel = 'positive' | 'negative' | 'neutral';
export type Probabilities = Record<SentimentLabel, number>;

export interface SentimentAssessment {
  label: SentimentLabel;
  engine: 'financial-v3' | 'tfidf' | 'heuristic';
  status: 'ready' | 'unavailable' | 'disabled';
  modelId?: string;
  modelLabel?: SentimentLabel;
  probabilities?: Probabilities;
  baseline?: { label: SentimentLabel; probabilities: Probabilities; modelId: string };
  scopeApplied?: boolean;
  scopeReason?: string | null;
  evidence?: { cue: string; target: string };
  needsReview: boolean;
  researchOnly: true;
}

export interface SentimentAnalysis {
  source: string;
  sampleSize: number;
  modelCount: number;
  reviewCount: number;
  baseline?: { positivePct: number; negativePct: number; neutralPct: number };
  scoreBasis: 'news-only' | 'news-and-fear-greed';
}

export function sentimentSource(a?: SentimentAssessment): string {
  if (!a) return 'UNASSESSED';
  if (a.engine === 'financial-v3') return 'Financial DistilRoBERTa + V3';
  if (a.engine === 'tfidf') return 'TF-IDF baseline';
  return a.status === 'unavailable' ? 'Heuristic · model unavailable' : 'Heuristic · model disabled';
}
