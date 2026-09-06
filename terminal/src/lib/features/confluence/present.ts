import { fmtZ } from '@/lib/format';
import type { ConfluenceData, ConfluenceLayer } from './types';

export function toConfluenceLabels(c: ConfluenceData) {
  return {
    macro: c.layers.MACRO.toFixed(1),
    onchain: c.layers.ONCHAIN.toFixed(1),
    sentiment: c.layers.SENTIMENT.toFixed(1),
    technical: c.layers.TECHNICAL.toFixed(1),
    news: c.layers.NEWS.toFixed(1),
    overall: c.scores.overall.toFixed(1),
    bullish: c.scores.bullish.toFixed(1),
    bearish: c.scores.bearish.toFixed(1),
  };
}

export function getConfluenceColor(score: number): string {
  if (score > 75) return 'var(--up)';
  if (score < 45) return 'var(--down)';
  return 'var(--mut)';
}

export const LAYER_DESCRIPTIONS: Record<ConfluenceLayer, string> = {
  MACRO: 'Macroeconomic conditions and policy',
  ONCHAIN: 'On-chain metrics and activity',
  SENTIMENT: 'Social sentiment and market mood',
  TECHNICAL: 'Technical analysis indicators',
  NEWS: 'News and event impact',
};
