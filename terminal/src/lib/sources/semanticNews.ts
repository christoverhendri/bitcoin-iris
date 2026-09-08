import type { EventCategory } from '@/lib/geo/classify';

const EVENT_TYPES = ['approval', 'rejection', 'ban', 'security_incident', 'liquidation', 'purchase',
  'sale', 'inflow', 'outflow', 'upward_movement', 'downward_movement', 'legal_action', 'rate_change'] as const;
type EventType = typeof EVENT_TYPES[number];
interface EvidenceSpan { text: string; start: number; end: number }
export interface SemanticEvent {
  event_type: EventType;
  polarity: 'affirmed' | 'negated' | 'unresolved';
  modality: 'asserted' | 'conditional' | 'expected' | 'planned' | 'rumored' | 'possible' | 'unresolved';
  needs_review: boolean;
  verified_occurrence: false;
  trigger: EvidenceSpan;
  evidence: EvidenceSpan;
  entity_mentions: { canonical: string | null }[];
}
export interface SemanticNews {
  rawText: string;
  parse: {
    parser_version: string;
    offset_basis: 'raw_text_unicode_codepoints';
    btc_relevance: 'explicit_mention' | 'undetermined';
    needs_review: boolean;
    events: SemanticEvent[];
    [key: string]: unknown;
  };
  weighting: {
    version: string;
    post_weight: number;
    as_of: string;
    basis: 'uncalibrated_ranking_heuristic';
    factors: Record<string, number>;
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const unit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Validate the versioned Python contract before using it to label an article. */
export function readSemanticNews(rawText: string, parsed: unknown, weighting: unknown): SemanticNews | undefined {
  if (!object(parsed) || parsed.parser_version !== 'iris-news-rules/1.1.0' ||
    parsed.offset_basis !== 'raw_text_unicode_codepoints' || typeof parsed.needs_review !== 'boolean' ||
    !['explicit_mention', 'undetermined'].includes(String(parsed.btc_relevance)) ||
    !Array.isArray(parsed.events) || parsed.events.length > 128) return;
  const codepoints = [...rawText];
  const span = (value: unknown): value is EvidenceSpan => object(value) &&
    typeof value.start === 'number' && Number.isInteger(value.start) && value.start >= 0 &&
    typeof value.end === 'number' && Number.isInteger(value.end) && value.end >= value.start && value.end <= codepoints.length &&
    typeof value.text === 'string' && codepoints.slice(value.start, value.end).join('') === value.text;
  for (const event of parsed.events) {
    if (!object(event) || !EVENT_TYPES.includes(event.event_type as EventType) ||
      !['affirmed', 'negated', 'unresolved'].includes(String(event.polarity)) ||
      !['asserted', 'conditional', 'expected', 'planned', 'rumored', 'possible', 'unresolved'].includes(String(event.modality)) ||
      typeof event.needs_review !== 'boolean' || event.verified_occurrence !== false ||
      !span(event.trigger) || !span(event.evidence) || !Array.isArray(event.entity_mentions) ||
      !event.entity_mentions.every((entity: unknown) => object(entity) && (entity.canonical === null || typeof entity.canonical === 'string'))) return;
  }
  if (!object(weighting) || weighting.version !== 'iris-post-weight/1.0.0' ||
    weighting.basis !== 'uncalibrated_ranking_heuristic' || !unit(weighting.post_weight) ||
    typeof weighting.as_of !== 'string' || !Number.isFinite(Date.parse(weighting.as_of)) || !object(weighting.factors)) return;
  for (const key of ['relevance', 'evidence', 'certainty', 'timestamp_quality', 'freshness', 'novelty']) {
    if (!unit(weighting.factors[key])) return;
  }
  return { rawText, parse: parsed, weighting } as SemanticNews;
}

/** Categories describe the reported topic, including negated or uncertain claims. */
export function semanticCategory(semantic: SemanticNews): EventCategory {
  const events = semantic.parse.events;
  if (events.some(e => e.event_type === 'security_incident')) return 'SECURITY';
  if (events.some(e => e.event_type === 'legal_action')) return 'LEGAL';
  if (events.some(e => e.event_type === 'rate_change')) return 'MONETARY';
  if (events.some(e => e.event_type === 'ban' ||
    (['approval', 'rejection'].includes(e.event_type) && e.entity_mentions.some(entity => entity.canonical === 'sec')))) return 'REGULATION';
  // The parser does not resolve ETF ownership, locations or market impact.
  return 'MARKET';
}
