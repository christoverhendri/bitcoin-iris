import 'server-only';
import { createHash } from 'node:crypto';
import { scoreHeadline } from '@/lib/sources/lexicon';
import type { Probabilities, SentimentAssessment, SentimentLabel } from './types';

const labels: SentimentLabel[] = ['negative', 'neutral', 'positive'];
const NEURAL_ID = 'mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis@ae0eab9ad336d7d548e0efe394b07c04bcaf6e91';
const BASELINE_ID = 'tfidf-logreg-d0d85bc862b5';
const pending = new Map<string, Promise<SentimentAssessment>>();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const isLabel = (x: unknown): x is SentimentLabel => labels.includes(x as SentimentLabel);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid worker object');
  return value as Record<string, unknown>;
}
function probabilities(value: unknown): Probabilities {
  const v = object(value);
  if (Object.keys(v).length !== 3 || labels.some((l) => typeof v[l] !== 'number' || !Number.isFinite(v[l]) || (v[l] as number) < 0 || (v[l] as number) > 1)
      || Math.abs(labels.reduce((sum, l) => sum + (v[l] as number), 0) - 1) > 0.00001) throw new Error('Invalid worker probabilities');
  return v as Probabilities;
}
function assessment(row: Record<string, unknown>, text: string, profile: string): SentimentAssessment {
  if (row.content_hash !== hash(text)) throw new Error('Worker text mismatch');
  const p = object(row.prediction), b = object(row.baseline);
  const scores = probabilities(p.probabilities), baselineScores = probabilities(b.probabilities);
  if (!isLabel(p.sentiment) || !isLabel(p.model_sentiment) || !isLabel(b.sentiment)
      || p.model_id !== NEURAL_ID || b.model_id !== BASELINE_ID || typeof p.needs_review !== 'boolean' || typeof b.needs_review !== 'boolean'
      || p.sentiment_policy !== 'parser_scope_v3' || p.probabilities_basis !== 'unmodified_model_only'
      || p.research_only !== true || p.raw_text !== text) throw new Error('Invalid worker prediction');
  if (scores[p.model_sentiment] + 1e-9 < Math.max(...Object.values(scores))
      || baselineScores[b.sentiment] + 1e-9 < Math.max(...Object.values(baselineScores))) throw new Error('Model label/score mismatch');
  const adjustment = object(p.sentiment_adjustment);
  if (typeof adjustment.eligible !== 'boolean' || adjustment.rules_version !== 'iris-sentiment-scope/0.3.0'
      || typeof adjustment.changed !== 'boolean' || adjustment.changed !== (p.sentiment !== p.model_sentiment)
      || (!adjustment.eligible && p.sentiment !== p.model_sentiment)) throw new Error('Invalid parser decision');
  const evidence = adjustment.eligible ? object(adjustment.evidence) : null;
  if (evidence && (evidence.proposed_sentiment !== p.sentiment || typeof object(evidence.cue).text !== 'string'
      || typeof object(evidence.target).text !== 'string')) throw new Error('Invalid scope evidence');
  const baseline = { label: b.sentiment, probabilities: baselineScores, modelId: b.model_id };
  if (profile === 'baseline') return { label: b.sentiment, engine: 'tfidf', status: 'ready', modelId: b.model_id,
    modelLabel: b.sentiment, probabilities: baselineScores, baseline, needsReview: b.needs_review, researchOnly: true };
  return { label: p.sentiment, engine: 'financial-v3', status: 'ready', modelId: p.model_id,
    modelLabel: p.model_sentiment, probabilities: scores, baseline, needsReview: p.needs_review,
    scopeApplied: adjustment.eligible, scopeReason: typeof adjustment.abstention_reason === 'string' ? adjustment.abstention_reason : null,
    evidence: evidence ? { cue: String(object(evidence.cue).text), target: String(object(evidence.target).text) } : undefined,
    researchOnly: true };
}

async function request(texts: string[], url: string, profile: string): Promise<Map<string, SentimentAssessment>> {
  const response = await fetch(`${url.replace(/\/$/, '')}/v1/predict`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ articles: texts.map((text) => ({ id: hash(text), text })) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Sentiment worker unavailable');
  const data = object(await response.json());
  if (data.schema !== 'iris-sentiment-worker/v1' || data.release_id !== 'iris-sentiment-local/1.0.0'
      || !Array.isArray(data.rows) || data.rows.length !== texts.length) throw new Error('Invalid worker batch');
  const wanted = new Map(texts.map((text) => [hash(text), text]));
  const result = new Map<string, SentimentAssessment>();
  for (const value of data.rows) {
    const row = object(value);
    if (typeof row.id !== 'string' || !wanted.has(row.id) || result.has(row.id)) throw new Error('Invalid worker identity');
    result.set(row.id, assessment(row, wanted.get(row.id)!, profile));
  }
  return result;
}

/** Per-headline single flight, including partially overlapping panel requests. */
export async function analyzeHeadlines(texts: string[]): Promise<SentimentAssessment[]> {
  const profile = process.env.IRIS_SENTIMENT_PROFILE ?? 'challenger';
  const url = process.env.IRIS_SENTIMENT_URL ?? 'http://127.0.0.1:8765';
  const enabled = profile === 'challenger' || profile === 'baseline';
  const key = (text: string) => `${url}|${profile}|${hash(text)}`;
  const results = new Map<string, Promise<SentimentAssessment>>();
  const missing: string[] = [];
  for (const text of new Set(texts)) {
    if (pending.has(key(text))) results.set(text, pending.get(key(text))!);
    else missing.push(text);
  }
  if (missing.length) {
    const flight = (async () => {
        let result: Map<string, SentimentAssessment>;
        try {
          if (!enabled) throw new Error('Model disabled');
          result = new Map();
          for (let start = 0; start < missing.length; start += 40) {
            for (const [id, value] of await request(missing.slice(start, start + 40), url, profile)) result.set(id, value);
          }
        } catch {
          result = new Map(missing.map((text) => [hash(text), { label: scoreHeadline(text), engine: 'heuristic',
            status: enabled ? 'unavailable' : 'disabled', needsReview: true, researchOnly: true } as SentimentAssessment]));
        }
        return result;
      })();
    for (const text of missing) {
      const item = flight.then((result) => {
        return result.get(hash(text))!;
      }).finally(() => pending.delete(key(text)));
      pending.set(key(text), item);
      results.set(text, item);
    }
  }
  return Promise.all(texts.map(async (text) => structuredClone(await results.get(text)!)));
}
