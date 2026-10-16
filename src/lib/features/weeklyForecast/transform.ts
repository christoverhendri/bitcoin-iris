import { realizedVolPct } from '@/lib/quant/series';
import type {
  ClassifierProvenance,
  ForecastDirection,
  ForecastDriver,
  WeeklyForecastData,
} from './types';

export interface ClfSignalRow {
  as_of: string;
  horizon_days: number;
  signal: 'BULL' | 'BEAR' | 'NONE';
  p_up: number;
  t_bear: number;
  t_bull: number;
  threshold_binary: number;
  direction_binary: 'BULL' | 'BEAR';
  margin: number;
  gate_pass: Record<string, boolean>;
  per_domain: Record<string, number>;
  n_nan_features: Record<string, number>;
  rule_method: string;
  model_name: string;
  model_created_utc: string;
  model_train_end: string;
  model_domains: string[];
  val_f1_macro: number;
  test_f1_macro: number;
  is_synthetic: boolean;
  created_at: string;
}

const STALE_THRESHOLD_MS = 9 * 24 * 60 * 60 * 1000; // 9 hari (D10)

/**
 * Fungsi murni pemetaan baris clf_signals -> WeeklyForecastData
 * Mengimplementasikan keputusan desain D4, D7, D8, D9, D10.
 */
export function rowToForecast(
  row: ClfSignalRow,
  closes: number[],
  nowMs?: number,
): WeeklyForecastData {
  // D4: Pemetaan label
  const label: ForecastDirection =
    row.signal === 'BULL' ? 'BULLISH' : row.signal === 'BEAR' ? 'BEARISH' : 'NEUTRAL';

  // D8: Perhitungan driver & score
  // c = (t_bear + t_bull) / 2
  // h = (t_bull - t_bear) / 2
  // n = jumlah domain
  // contribution_d = (p_d - c) / (n * h)
  // score = Σ contribution_d = (p_avg - c) / h
  const tBear = row.t_bear;
  const tBull = row.t_bull;
  const c = (tBear + tBull) / 2;
  const h = (tBull - tBear) / 2;

  const domainNames = Object.keys(row.per_domain);
  const n = domainNames.length > 0 ? domainNames.length : 1;

  const drivers: ForecastDriver[] = domainNames.map((d) => {
    const p_d = row.per_domain[d];
    const signalNorm = h > 0 ? (p_d - c) / h : 0;
    const contribution = h > 0 ? (p_d - c) / (n * h) : 0;
    return {
      name: d,
      signal: signalNorm,
      contribution,
      reading: `${(p_d * 100).toFixed(1)}%`,
    };
  });

  // Score adalah penjumlahan kontribusi domain
  const score = drivers.reduce((acc, d) => acc + d.contribution, 0);

  // D9: Range tanpa drift dari skor
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : 100000;
  const vol = closes.length >= 2 ? realizedVolPct(closes, Math.min(30, closes.length)) : 50;
  const z = 1.0;
  const sigma = lastClose * (vol / 100) * Math.sqrt(7 / 365);
  let min = lastClose - z * sigma;
  let max = lastClose + z * sigma;
  if (min > max) [min, max] = [max, min];

  // D10: Staleness check
  const now = nowMs ?? Date.now();
  const createdTime = new Date(row.created_at).getTime();
  const stale = Number.isFinite(createdTime) ? now - createdTime > STALE_THRESHOLD_MS : false;

  const classifier: ClassifierProvenance = {
    signal: row.signal,
    pUp: row.p_up,
    tBear: row.t_bear,
    tBull: row.t_bull,
    thresholdBinary: row.threshold_binary,
    directionBinary: row.direction_binary,
    perDomain: row.per_domain,
    dataAsOf: row.as_of,
    createdAt: row.created_at,
    modelTrainEnd: row.model_train_end,
    modelDomains: row.model_domains,
    valF1: row.val_f1_macro,
    testF1: row.test_f1_macro,
    stale,
  };

  return {
    method: 'classifier',
    label,
    confidence: row.p_up * 100, // Disajikan sebagai P(UP, 7D) dalam persen
    range: { min, max },
    drivers,
    score,
    classifier,
  };
}
