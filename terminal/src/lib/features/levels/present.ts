import { fmtUsd } from '@/lib/format';
import type { SupportResistanceLevels } from './types';

export function toLevelsLabels(l: SupportResistanceLevels) {
  return {
    r2: fmtUsd(l.r2),
    r1: fmtUsd(l.r1),
    vwap: fmtUsd(l.vwap),
    s1: fmtUsd(l.s1),
    s2: fmtUsd(l.s2),
  };
}
