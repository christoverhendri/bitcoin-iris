import { dateSeed, mulberry32 } from '@/lib/rng';
import { impactTier } from '@/lib/features/geopoliticalEvents/present';
import type { EventCategory } from '@/lib/geo/classify';
import type { NewsArticle, NewsArgs } from './types';

const DUMMY_ARTICLES: {
  title: string;
  source: string;
  sentiment: NewsArticle['sentiment'];
  category: EventCategory;
  description: string;
}[] = [
  {
    title: 'Bitcoin Reaches New Milestone in Institutional Adoption',
    source: 'CryptoPanic',
    sentiment: 'positive',
    category: 'ADOPTION',
    description:
      'A fresh wave of corporate treasuries added bitcoin to their balance sheets this quarter, according to filings compiled by industry trackers.',
  },
  {
    title: 'Regulatory Pressure on Crypto Markets Intensifies in Washington',
    source: 'Reuters',
    sentiment: 'negative',
    category: 'REGULATION',
    description:
      'Lawmakers signalled a tougher stance on digital-asset intermediaries, with a draft framework expected before the next session.',
  },
  {
    title: 'Spot ETF Sees Largest Single-Day Inflow Since Launch',
    source: 'Bloomberg',
    sentiment: 'positive',
    category: 'ETF_FUND',
    description:
      'Net creations across the spot bitcoin funds topped prior records as advisers rotated client allocations into the products.',
  },
  {
    title: 'Exchange Discloses Security Incident Affecting Hot Wallet',
    source: 'CoinDesk',
    sentiment: 'negative',
    category: 'SECURITY',
    description:
      'The venue paused withdrawals while it investigated unauthorised outflows, and said customer balances would be covered.',
  },
  {
    title: 'Developer Activity Across Layer-2 Networks Continues to Grow',
    source: 'CoinGecko',
    sentiment: 'neutral',
    category: 'MARKET',
    description:
      'Commit counts and active-contributor metrics ticked higher month over month, though token prices were little changed.',
  },
];

export function mockNews({ limit = 5 }: NewsArgs): NewsArticle[] {
  const rand = mulberry32(dateSeed('news'));
  const out: NewsArticle[] = [];
  for (let i = 0; i < Math.min(limit, DUMMY_ARTICLES.length); i++) {
    const a = DUMMY_ARTICLES[i];
    const impact = 40 + Math.floor(rand() * 45);
    out.push({
      ...a,
      btcWindow: `${10 + i * 5} hours`,
      impact,
      impactTier: impactTier(impact),
      publishedAt: 0,
    });
  }
  return out;
}
