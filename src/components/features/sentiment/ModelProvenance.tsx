import type { SentimentAnalysis, SentimentAssessment } from '@/lib/sentiment/types';
import { sentimentSource } from '@/lib/sentiment/types';

export function HeadlineModel({ assessment }: { assessment?: SentimentAssessment }) {
  if (!assessment) return null;
  const title = [assessment.modelId, assessment.modelLabel && `Model-only: ${assessment.modelLabel}`,
    assessment.baseline && `TF-IDF: ${assessment.baseline.label}`,
    assessment.scopeApplied ? `Parser applied: ${assessment.evidence?.cue} → ${assessment.evidence?.target}` : assessment.scopeReason,
    'Text sentiment; not a BTC price forecast.'].filter(Boolean).join(' · ');
  return <span title={title} style={{ display: 'block', color: 'var(--dim)', fontSize: 12.5, lineHeight: 1.5, padding: '0 18px 6px' }}>
    {sentimentSource(assessment)}{assessment.needsReview ? ' · review' : ''}
    {assessment.baseline ? ` · TF-IDF ${assessment.baseline.label}` : ''}
  </span>;
}

export function ModelProvenance({ analysis }: { analysis?: SentimentAnalysis }) {
  if (!analysis) return null;
  return <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--dim)', padding: '10px 18px' }}>
    <div>{analysis.source} · research</div>
    <div>{analysis.sampleSize} headlines · {analysis.modelCount} model results · {analysis.reviewCount} for review</div>
    {analysis.baseline && <div>TF-IDF baseline: {analysis.baseline.positivePct.toFixed(1)}% positive / {analysis.baseline.neutralPct.toFixed(1)}% neutral / {analysis.baseline.negativePct.toFixed(1)}% negative</div>}
    <div>Text sentiment of headlines · not a BTC price forecast</div>
  </div>;
}
