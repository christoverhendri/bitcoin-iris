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
    dataAsOf: f.classifier?.dataAsOf ?? '',
    modelTrainEnd: f.classifier?.modelTrainEnd ?? '',
    f1Summary: f.classifier
      ? `Val F1: ${(f.classifier.valF1 * 100).toFixed(1)}% · Test F1: ${(f.classifier.testF1 * 100).toFixed(1)}%`
      : '',
  };
}

export function getWeeklyForecastColor(label: string): string {
  if (label === 'BULLISH' || label === 'BULL') return 'var(--up)';
  if (label === 'BEARISH' || label === 'BEAR') return 'var(--down)';
  return 'var(--mut)';
}
