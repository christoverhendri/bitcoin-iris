import { fmtUsd, fmtPct } from '@/lib/format';
import type { WeeklyForecastData } from './types';

export function toWeeklyForecastLabels(f: WeeklyForecastData) {
  const isClassifier = f.method === 'classifier';
  const isNoSignal = isClassifier && f.classifier?.signal === 'NONE';
  const displayLabel = isNoSignal ? 'NO SIGNAL' : f.label;

  return {
    label: displayLabel,
    rawLabel: f.label,
    isNoSignal,
    isClassifier,
    confidence: fmtPct(f.confidence, false),
    minRange: fmtUsd(f.range.min),
    maxRange: fmtUsd(f.range.max),
    stale: f.classifier?.stale ?? false,
    pUpPct: f.classifier ? `${(f.classifier.pUp * 100).toFixed(1)}%` : fmtPct(f.confidence, false),
    tBearPct: f.classifier ? `${(f.classifier.tBear * 100).toFixed(0)}%` : '',
    tBullPct: f.classifier ? `${(f.classifier.tBull * 100).toFixed(0)}%` : '',
    isBinary: f.classifier?.isBinary ?? false,
    thresholdPct: f.classifier ? `${(f.classifier.tBull * 100).toFixed(1)}%` : '',
    confidencePct: f.classifier?.track ? `${(f.classifier.track.precision * 100).toFixed(1)}%` : '',
    baseRatePct: f.classifier?.track ? `${(f.classifier.track.baseRate * 100).toFixed(1)}%` : '',
    confidenceN: f.classifier?.track?.n ?? 0,
    confidenceWindow: f.classifier?.track
      ? `${f.classifier.track.evalFrom} – ${f.classifier.track.evalTo}`
      : '',
    dataAsOf: f.classifier?.dataAsOf ?? '',
    modelTrainEnd: f.classifier?.modelTrainEnd ?? '',
    f1Summary: f.classifier
      ? `Val F1: ${(f.classifier.valF1 * 100).toFixed(1)}% · Test F1: ${(f.classifier.testF1 * 100).toFixed(1)}%`
      : '',
  };
}

/** The model's horizon: it predicts the close 7 days after `dataAsOf`. */
export const FORECAST_HORIZON_DAYS = 7;

/** `dataAsOf` (YYYY-MM-DD, last closed UTC candle) + horizon -> the close being forecast. */
export function forecastTargetDate(dataAsOf: string, days = FORECAST_HORIZON_DAYS): string {
  const t = Date.parse(`${dataAsOf}T00:00:00Z`);
  if (!Number.isFinite(t)) return '';
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * How often the ±1σ 7-day volatility band has contained the actual close 7 days
 * later. Measured by `worker/scripts/backtest_vol_band.py` with the same formula
 * as the band itself, BTC daily closes 2018-03 → 2026-10: 70.2% overall,
 * 63-76% by year. Re-run that script to refresh it.
 */
export const VOL_BAND_HIT_RATE = { pct: 70, since: 2018, minYearPct: 63, maxYearPct: 76 } as const;

export function getWeeklyForecastColor(label: string): string {
  if (label === 'BULLISH' || label === 'BULL') return 'var(--up)';
  if (label === 'BEARISH' || label === 'BEAR') return 'var(--down)';
  return 'var(--mut)';
}
