import { fmtUsd, fmtCount } from '@/lib/format';
import type { OhlcvCandle } from './types';

export function toOhlcvLabel(c: OhlcvCandle): { open: string; high: string; low: string; close: string; volume: string } {
  return {
    open: fmtUsd(c.open),
    high: fmtUsd(c.high),
    low: fmtUsd(c.low),
    close: fmtUsd(c.close),
    volume: fmtCount(c.volume),
  };
}
