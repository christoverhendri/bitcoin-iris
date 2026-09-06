/**
 * Technical indicator math over a plain close/candle series.
 *
 * These run in the live path (`indicators/live.ts`, `levels/live.ts`,
 * `volatility/live.ts`) on real Coinbase candles. Pure functions, no
 * dependencies — the same ~8 formulas the plan earmarked as "40 lines of
 * pandas", written once here in TypeScript instead.
 *
 * Every function takes oldest-first input and reads the most recent value as the
 * last element.
 */

export interface Ohlc {
  high: number;
  low: number;
  close: number;
  open: number;
}

/** Exponential moving average. Returns the series; caller takes `.at(-1)`. */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Wilder's RSI. Returns the final value (0-100). */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

/** MACD line + signal line (12/26/9 by default), final values. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: number; signal: number } {
  if (closes.length < slow) return { macd: 0, signal: 0 };
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signal = ema(line, signalPeriod);
  return { macd: line[line.length - 1], signal: signal[signal.length - 1] };
}

/** Bollinger Bands: middle SMA ± `mult` standard deviations. */
export function bollinger(
  closes: number[],
  period = 20,
  mult = 2,
): { upper: number; middle: number; lower: number } {
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / slice.length;
  const sd = Math.sqrt(variance);
  return { upper: mid + mult * sd, middle: mid, lower: mid - mult * sd };
}

/** Average True Range as a percentage of the last close. */
export function atrPct(candles: Ohlc[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close),
      ),
    );
  }
  const atr = sma(trs, period);
  const lastClose = candles[candles.length - 1].close;
  return lastClose > 0 ? (atr / lastClose) * 100 : 0;
}

/**
 * Annualised realised volatility (%) from the last `window` daily closes:
 * stdev of daily log returns × √365 × 100.
 */
export function realizedVolPct(closes: number[], window: number): number {
  const slice = closes.slice(-(window + 1));
  if (slice.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

/** Classic floor-trader pivot points from the last completed period's HLC. */
export function pivotPoints(high: number, low: number, close: number): {
  r2: number;
  r1: number;
  pivot: number;
  s1: number;
  s2: number;
} {
  const pivot = (high + low + close) / 3;
  return {
    r2: pivot + (high - low),
    r1: 2 * pivot - low,
    pivot,
    s1: 2 * pivot - high,
    s2: pivot - (high - low),
  };
}

/** Volume-weighted average price across the given candles. */
export function vwap(candles: (Ohlc & { volume: number })[]): number {
  let pv = 0;
  let v = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : candles[candles.length - 1]?.close ?? 0;
}
