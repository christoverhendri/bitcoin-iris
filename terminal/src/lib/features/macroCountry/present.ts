import { fmtUsd, fmtPct, fmtZ } from '@/lib/format';
import type { MacroMetric } from './types';

export function toMacroCountryLabels(m: MacroMetric) {
  return {
    country: m.country,
    cpi: fmtUsd(m.cpi),
    rate: fmtPct(m.rate, false),
    growth: fmtPct(m.growth, true),
    inflation: fmtPct(m.inflation, false),
    zCpi: fmtZ(m.zScores.cpi),
    zRate: fmtZ(m.zScores.rate),
    zGrowth: fmtZ(m.zScores.growth),
    zInflation: fmtZ(m.zScores.inflation),
  };
}

export function getMacroZScoreColor(z: number): string {
  if (z > 1) return 'var(--up)';
  if (z < -1) return 'var(--down)';
  return 'var(--mut)';
}
