import { createKeywordMatcher } from './matchKeyword';

/**
 * Headline sentiment by keyword lexicon. This is a heuristic, not a model — it
 * scores the words in a title, nothing more. The news feature labels its output
 * "HEURISTIC" in the panel so the number is never mistaken for NLP.
 *
 * Kept deliberately small and transparent: a phrase either moves the score or it
 * does not, and the list is right here to audit.
 */

const BULLISH = [
  'surge', 'surges', 'soar', 'soars', 'soared', 'rally', 'rallies', 'rallied', 'jump', 'jumps', 'gain', 'gains', 'rise', 'rises', 'rising', 'climb', 'climbs', 'breakout', 'bull', 'bullish',
  'record high', 'all-time high', 'ath', 'adoption', 'approval', 'approved', 'inflow', 'inflows',
  'accumulate', 'buy', 'upgrade', 'partnership', 'institutional', 'etf inflow', 'green',
  'recover', 'recovers', 'rebound', 'rebounds', 'outperform', 'outperforms', 'milestone', 'boost', 'boosts', 'optimism',
];

const BEARISH = [
  'crash', 'crashes', 'crashed', 'plunge', 'plunges', 'plummet', 'plummets', 'drop', 'drops', 'fall', 'falls', 'slump', 'slumps', 'sink', 'sinks', 'bear', 'bearish', 'sell-off',
  'selloff', 'liquidation', 'hack', 'hacks', 'hacked', 'exploit', 'exploited', 'lawsuit', 'sec charges', 'ban', 'bans', 'banned', 'crackdown',
  'outflow', 'outflows', 'dump', 'downgrade', 'warning', 'fear', 'collapse', 'fraud', 'scam',
  'delay', 'reject', 'rejected', 'probe', 'investigation', 'decline', 'losses', 'red',
];

export type Sentiment = 'positive' | 'negative' | 'neutral';

/** Net keyword score → label. Ties and no-hits resolve to neutral. */
export function scoreHeadline(title: string): Sentiment {
  const matches = createKeywordMatcher(title);
  let score = 0;
  for (const w of BULLISH) if (matches(w)) score += 1;
  for (const w of BEARISH) if (matches(w)) score -= 1;
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}
