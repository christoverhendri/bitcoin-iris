/**
 * Headline sentiment by keyword lexicon. This is a heuristic, not a model — it
 * scores the words in a title, nothing more. The news feature labels its output
 * "HEURISTIC" in the panel so the number is never mistaken for NLP.
 *
 * Kept deliberately small and transparent: a phrase either moves the score or it
 * does not, and the list is right here to audit.
 */

const BULLISH = [
  'surge', 'soar', 'rally', 'jump', 'gain', 'rise', 'climb', 'breakout', 'bull',
  'record high', 'all-time high', 'ath', 'adoption', 'approval', 'approved', 'inflow',
  'accumulate', 'buy', 'upgrade', 'partnership', 'institutional', 'etf inflow', 'green',
  'recover', 'rebound', 'outperform', 'milestone', 'boost', 'optimism',
];

const BEARISH = [
  'crash', 'plunge', 'plummet', 'drop', 'fall', 'slump', 'sink', 'bear', 'sell-off',
  'selloff', 'liquidation', 'hack', 'exploit', 'lawsuit', 'sec charges', 'ban', 'crackdown',
  'outflow', 'dump', 'downgrade', 'warning', 'fear', 'collapse', 'fraud', 'scam',
  'delay', 'reject', 'rejected', 'probe', 'investigation', 'decline', 'losses', 'red',
];

export type Sentiment = 'positive' | 'negative' | 'neutral';

/** Net keyword score → label. Ties and no-hits resolve to neutral. */
export function scoreHeadline(title: string): Sentiment {
  const t = title.toLowerCase();
  let score = 0;
  for (const w of BULLISH) if (t.includes(w)) score += 1;
  for (const w of BEARISH) if (t.includes(w)) score -= 1;
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}
