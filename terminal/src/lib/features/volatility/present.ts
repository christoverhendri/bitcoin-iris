import { fmtPct } from '@/lib/format';
import type { VolatilityData } from './types';

export function toVolatilityLabels(v: VolatilityData) {
  return {
    vol30d: fmtPct(v.vol30d, false),
    vol90d: fmtPct(v.vol90d, false),
  };
}
