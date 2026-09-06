import { seeded } from '@/lib/rng';
import type { IndicatorData, IndicatorArgs } from './types';

export function mockIndicators({ symbol = 'BTC' }: IndicatorArgs): IndicatorData {
  const r = seeded(`indicators_${symbol}`);
  
  const rsi = 30 + r() * 40;
  const macd = (r() - 0.5) * 200;
  const macdSignal = (r() - 0.5) * 180;
  const ema21 = 110000 + (r() - 0.5) * 4000;
  const ema13 = ema21 * (1 + (r() - 0.5) * 0.01);
  const ema8 = ema21 * (1 + (r() - 0.5) * 0.015);
  const ema5 = ema21 * (1 + (r() - 0.5) * 0.02);
  
  const middle = ema21;
  const std = ema21 * 0.02;
  
  return {
    rsi,
    macd,
    macdSignal,
    ema5,
    ema8,
    ema13,
    ema21,
    bollingerUpper: middle + 2 * std,
    bollingerMiddle: middle,
    bollingerLower: middle - 2 * std,
  };
}
