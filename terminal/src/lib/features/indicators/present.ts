import { fmtUsd, fmtZ } from '@/lib/format';
import type { IndicatorData } from './types';

export function toIndicatorLabels(d: IndicatorData) {
  return {
    rsi: d.rsi.toFixed(2),
    macd: fmtZ(d.macd),
    macdSignal: fmtZ(d.macdSignal),
    ema5: fmtUsd(d.ema5),
    ema8: fmtUsd(d.ema8),
    ema13: fmtUsd(d.ema13),
    ema21: fmtUsd(d.ema21),
    bollingerUpper: fmtUsd(d.bollingerUpper),
    bollingerMiddle: fmtUsd(d.bollingerMiddle),
    bollingerLower: fmtUsd(d.bollingerLower),
  };
}
