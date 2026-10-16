import { seeded } from '@/lib/rng';
import type { WeeklyForecastData, WeeklyForecastArgs } from './types';

/** Same four signals the rule actually blends, with the same weights. */
const WEIGHTS = { rsi: 0.25, macd: 0.3, emaGap: 0.3, fng: 0.15 } as const;

export function mockWeeklyForecast({ symbol = 'BTC' }: WeeklyForecastArgs): WeeklyForecastData {
  const r = seeded(`weekly_forecast_${symbol}`);

  const current = 110000;

  // Build the mock the way the live path does — signals first, label last — so
  // the breakdown panel shows contributions that genuinely sum to the score
  // rather than four numbers reverse-engineered from a label.
  const signals = {
    rsi: r() * 2 - 1,
    macd: r() * 2 - 1,
    emaGap: r() * 2 - 1,
    fng: r() * 2 - 1,
  };
  const denom = WEIGHTS.rsi + WEIGHTS.macd + WEIGHTS.emaGap + WEIGHTS.fng;
  const score =
    (WEIGHTS.rsi * signals.rsi +
      WEIGHTS.macd * signals.macd +
      WEIGHTS.emaGap * signals.emaGap +
      WEIGHTS.fng * signals.fng) /
    denom;

  const label: WeeklyForecastData['label'] =
    score > 0.15 ? 'BULLISH' : score < -0.15 ? 'BEARISH' : 'NEUTRAL';

  return {
    method: 'rule',
    label,
    score,
    confidence: Math.min(95, 50 + Math.abs(score) * 60),
    range: {
      min: current * (1 - 0.1 - r() * 0.05),
      max: current * (1 + 0.1 + r() * 0.05),
    },
    drivers: [
      {
        name: 'RSI (14)',
        signal: signals.rsi,
        contribution: (WEIGHTS.rsi * signals.rsi) / denom,
        reading: (50 + signals.rsi * 50).toFixed(1),
      },
      {
        name: 'MACD histogram',
        signal: signals.macd,
        contribution: (WEIGHTS.macd * signals.macd) / denom,
        reading: (signals.macd * 400).toFixed(1),
      },
      {
        name: 'EMA21 vs EMA50',
        signal: signals.emaGap,
        contribution: (WEIGHTS.emaGap * signals.emaGap) / denom,
        reading: `${signals.emaGap >= 0 ? '+' : ''}${(signals.emaGap * 5).toFixed(2)}%`,
      },
      {
        name: 'Fear & Greed',
        signal: signals.fng,
        contribution: (WEIGHTS.fng * signals.fng) / denom,
        reading: Math.round(50 + signals.fng * 50).toString(),
      },
    ],
  };
}
