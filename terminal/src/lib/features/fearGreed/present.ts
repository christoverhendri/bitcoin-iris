import { fmtPct } from '@/lib/format';
import type { FearGreedData } from './types';

export function toFearGreedLabel(d: FearGreedData): { label: string; color: string } {
  const colors: Record<FearGreedData['classification'], string> = {
    'Extreme Fear': 'var(--down)',
    Fear: 'var(--down)',
    Neutral: 'var(--mut)',
    Greed: 'var(--up)',
    'Extreme Greed': 'var(--up)',
  };
  return { label: d.classification, color: colors[d.classification] };
}
