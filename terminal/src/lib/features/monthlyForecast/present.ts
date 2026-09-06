import { fmtUsd, fmtPct } from '@/lib/format';
import type { MonthlyForecastPath } from './types';

export function toMonthlyForecastLabels(f: MonthlyForecastPath) {
  return {
    p10: fmtUsd(f.p10),
    p50: fmtUsd(f.p50),
    p90: fmtUsd(f.p90),
  };
}

export function getMonthlyPathColor(pct: number): string {
  if (pct > 0) return 'var(--up)';
  if (pct < 0) return 'var(--down)';
  return 'var(--mut)';
}
