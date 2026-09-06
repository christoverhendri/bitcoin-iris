import { fmtPct } from '@/lib/format';
import type { SeasonalityCell } from './types';

export function toSeasonalityLabel(c: SeasonalityCell) {
  return fmtPct(c.returnPct, true);
}

export function getSeasonalityColor(returnPct: number): string {
  if (returnPct > 20) return 'var(--up)';
  if (returnPct < -20) return 'var(--down)';
  return 'var(--mut)';
}
