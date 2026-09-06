import { fmtUsd, fmtPct } from '@/lib/format';
import type { WeeklyForecastData } from './types';

export function toWeeklyForecastLabels(f: WeeklyForecastData) {
  return {
    label: f.label,
    confidence: fmtPct(f.confidence, false),
    minRange: fmtUsd(f.range.min),
    maxRange: fmtUsd(f.range.max),
  };
}

export function getWeeklyForecastColor(label: string): string {
  if (label === 'BULLISH') return 'var(--up)';
  if (label === 'BEARISH') return 'var(--down)';
  return 'var(--mut)';
}
