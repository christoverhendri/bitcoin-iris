/**
 * Rule-based event classifier. Maps a raw headline to one of eight buckets by
 * keyword match. This is a heuristic, not a model — the panel badges its output
 * as placeholder classification, same as the news sentiment lexicon.
 *
 * The first set that matches, in the order declared below, wins. `MARKET` is the
 * fallback when nothing else hits.
 */

export type EventCategory =
  | 'REGULATION'
  | 'ETF_FUND'
  | 'SECURITY'
  | 'MONETARY'
  | 'GEOPOLITICS'
  | 'ADOPTION'
  | 'LEGAL'
  | 'MARKET'
  /**
   * On-chain exchange flows. Not headline-derived and deliberately given no
   * keyword rules — `classify()` can never return it. Events in this category
   * are injected by `lib/onchain/flowEvents`.
   */
  | 'WHALE_FLOW';

/** Stable display order — used by the layer toggle and the legend. */
export const EVENT_CATEGORIES: EventCategory[] = [
  'REGULATION',
  'ETF_FUND',
  'SECURITY',
  'MONETARY',
  'GEOPOLITICS',
  'ADOPTION',
  'LEGAL',
  'MARKET',
  'WHALE_FLOW',
];

/** Keyword sets, checked in this order. */
const RULES: { category: EventCategory; keywords: string[] }[] = [
  {
    category: 'REGULATION',
    keywords: [
      'sec ', 'regulation', 'regulator', 'regulatory', 'mica', ' ban', 'banned', 'license',
      'licence', 'licensing', 'framework', 'compliance', 'oversight', 'rulebook', 'watchdog',
      'crackdown',
    ],
  },
  {
    category: 'ETF_FUND',
    keywords: [
      'etf', 'spot etf', 'blackrock', 'grayscale', 'fidelity', 'ishares', 'inflow', 'outflow',
      'aum', 'fund launch', 'asset manager', 'bitwise', 'ark invest',
    ],
  },
  {
    category: 'SECURITY',
    keywords: [
      'hack', 'hacked', 'exploit', 'breach', 'stolen', 'drain', 'drained', 'phishing',
      'rug pull', 'private key', 'compromised', 'security incident',
    ],
  },
  {
    category: 'MONETARY',
    keywords: [
      'fed ', 'federal reserve', 'rate cut', 'rate hike', 'fomc', 'cpi', 'inflation', 'ecb',
      'boj', 'bank of japan', 'bank of england', 'treasury yield', 'jobs report', 'pce',
      'quantitative', 'jerome powell', 'powell',
    ],
  },
  {
    category: 'GEOPOLITICS',
    keywords: [
      'sanction', 'war', 'election', 'conflict', 'tariff', 'trade war', 'invasion', 'ceasefire',
      'geopolit', 'military', 'missile', 'coup', 'summit',
    ],
  },
  {
    category: 'ADOPTION',
    keywords: [
      'legal tender', 'adopts', 'adoption', 'treasury holding', 'accepts bitcoin', 'integration',
      'integrates', 'rollout', 'now accepts', 'payment option', 'strategic reserve',
    ],
  },
  {
    category: 'LEGAL',
    keywords: [
      'lawsuit', 'court', 'ruling', 'settlement', 'indictment', 'sentenced', 'plea', 'verdict',
      'appeal', 'subpoena', 'charges', 'convicted', 'trial',
    ],
  },
];

/** Lowercase, then first matching rule set wins; MARKET is the fallback. */
export function classify(title: string): EventCategory {
  const t = ` ${title.toLowerCase()} `;
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (t.includes(kw)) return rule.category;
    }
  }
  return 'MARKET';
}
