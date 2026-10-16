/**
 * Live weekly forecast — a transparent RULE, not a model. The panel's
 * "RULE-BASED PLACEHOLDER" badge stays accurate: this is a weighted sum of a few
 * normalized technical/sentiment signals over real Coinbase daily candles
 * (Kraken fallback), plus the alternative.me Fear & Greed reading.
 */
import { getCandles as coinbaseCandles } from '@/lib/sources/coinbase';
import { getCandles as krakenCandles } from '@/lib/sources/kraken';
import { getFearGreed } from '@/lib/sources/alternativeme';
import { ema, rsi, macd, realizedVolPct } from '@/lib/quant/series';
import { getSupabase, asRow } from '@/lib/supabase/server';
import { rowToForecast, type ClfSignalRow } from './transform';
import type { WeeklyForecastData, WeeklyForecastArgs } from './types';

const CLF_COLUMNS =
  'as_of, horizon_days, signal, p_up, t_bear, t_bull, threshold_binary, direction_binary, margin, gate_pass, per_domain, n_nan_features, rule_method, model_name, model_created_utc, model_train_end, model_domains, val_f1_macro, test_f1_macro, is_synthetic, created_at';

/**
 * Arbitrary internal weights for the rule. They sum to 1.0 and express how much
 * each normalized signal (each in roughly [-1, 1]) moves the composite score.
 * Not fitted to anything — a documented heuristic blend.
 */
const WEIGHTS = {
  rsi: 0.25, // RSI distance from 50, i.e. (rsi - 50) / 50
  macd: 0.3, // sign of the MACD histogram, scaled by its size vs price
  emaGap: 0.3, // sign of EMA21 - EMA50 gap, scaled by the gap as % of price
  fng: 0.15, // Fear & Greed distance from 50, i.e. (value - 50) / 50
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Dev lokal tanpa Supabase: worker menulis sinyal terakhir ke
 * `worker/out/clf_signal_latest.json` (baris yang sama persis dengan yang di-upsert ke
 * clf_signals). Hanya dibaca kalau CLF_LOCAL_SIGNAL_FILE di-set DAN Supabase belum
 * dikonfigurasi — di produksi Supabase selalu menang.
 */
async function readLocalSignal(): Promise<ClfSignalRow | null> {
  const file = process.env.CLF_LOCAL_SIGNAL_FILE;
  if (!file) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const row = JSON.parse(await readFile(file, 'utf8')) as ClfSignalRow;
    return row && typeof row.as_of === 'string' && typeof row.p_up === 'number' ? row : null;
  } catch (err) {
    console.warn('[weeklyForecast:local_signal]', err);
    return null;
  }
}

async function classifierEnvelope(row: ClfSignalRow) {
  let candles;
  try {
    candles = await coinbaseCandles('1d', 60, 'BTC-USD');
  } catch {
    candles = await krakenCandles('1d', 'XBTUSD').catch(() => []);
  }
  const closes = (candles ?? []).map((c) => c.close);
  return {
    data: rowToForecast(row, closes),
    asOf: row.created_at,
    synthetic: row.is_synthetic,
  };
}

export async function fetchWeeklyForecast({ symbol = 'BTC' }: WeeklyForecastArgs) {
  void symbol;

  // 1. Fallback Tier 1: Baca sinyal model klasifikasi terlatih dari Supabase jika ada (D5)
  const db = getSupabase();
  if (!db) {
    const local = await readLocalSignal();
    if (local) return classifierEnvelope(local);
  }
  if (db) {
    try {
      const { data: clfRows, error } = await db
        .from('clf_signals')
        .select(CLF_COLUMNS)
        .order('as_of', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('[weeklyForecast:clf_signals]', error.message);
      } else if (clfRows && clfRows.length > 0) {
        return classifierEnvelope(asRow<ClfSignalRow>(clfRows[0]));
      }
    } catch (err) {
      console.warn('[weeklyForecast:clf_signals_catch]', err);
    }
  }

  // 2. Fallback Tier 2: Aturan berbobot (rule-based) candle asli tanpa perubahan perilaku (D5)
  let candles;
  try {
    candles = await coinbaseCandles('1d', 300, 'BTC-USD');
    if (candles.length < 60) throw new Error('not enough coinbase candles');
  } catch {
    candles = await krakenCandles('1d', 'XBTUSD');
  }
  if (candles.length < 60) return null;

  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  const rsiVal = rsi(closes, 14);
  const { macd: macdLine, signal } = macd(closes);
  const hist = macdLine - signal;
  const ema21 = ema(closes, 21).at(-1) ?? lastClose;
  const ema50 = ema(closes, 50).at(-1) ?? lastClose;
  const emaGapPct = ((ema21 - ema50) / lastClose) * 100;
  const vol = realizedVolPct(closes, 30);

  const fng = await getFearGreed(1).catch(() => null);
  const fngVal = fng && fng.length ? fng[0].value : null;

  // Normalize each signal to roughly [-1, 1].
  const nRsi = clamp((rsiVal - 50) / 50, -1, 1);
  const nMacd = clamp((hist / lastClose) * 2000, -1, 1); // histogram as fraction of price, scaled
  const nEmaGap = clamp(emaGapPct / 5, -1, 1); // a 5% EMA gap saturates the signal
  const nFng = fngVal === null ? 0 : clamp((fngVal - 50) / 50, -1, 1);

  const wFng = fngVal === null ? 0 : WEIGHTS.fng;
  const denom = WEIGHTS.rsi + WEIGHTS.macd + WEIGHTS.emaGap + wFng;
  const score = clamp(
    (WEIGHTS.rsi * nRsi + WEIGHTS.macd * nMacd + WEIGHTS.emaGap * nEmaGap + wFng * nFng) / denom,
    -1,
    1,
  );

  const label: WeeklyForecastData['label'] =
    score > 0.15 ? 'BULLISH' : score < -0.15 ? 'BEARISH' : 'NEUTRAL';
  const confidence = Math.min(95, 50 + Math.abs(score) * 60);

  const z = 1.0;
  const sigma = lastClose * (vol / 100) * Math.sqrt(7 / 365);
  const driftFromScore = lastClose * score * 0.03;
  let min = lastClose - z * sigma + driftFromScore;
  let max = lastClose + z * sigma + driftFromScore;
  if (min > max) [min, max] = [max, min];

  // The contributions that actually produced `score`, carried through to the UI
  // rather than recomputed there from the conclusion.
  const drivers: WeeklyForecastData['drivers'] = [
    {
      name: 'RSI (14)',
      signal: nRsi,
      contribution: (WEIGHTS.rsi * nRsi) / denom,
      reading: rsiVal.toFixed(1),
    },
    {
      name: 'MACD histogram',
      signal: nMacd,
      contribution: (WEIGHTS.macd * nMacd) / denom,
      reading: hist.toFixed(1),
    },
    {
      name: 'EMA21 vs EMA50',
      signal: nEmaGap,
      contribution: (WEIGHTS.emaGap * nEmaGap) / denom,
      reading: `${emaGapPct >= 0 ? '+' : ''}${emaGapPct.toFixed(2)}%`,
    },
    {
      name: 'Fear & Greed',
      signal: nFng,
      contribution: (wFng * nFng) / denom,
      reading: fngVal === null ? 'unavailable' : String(fngVal),
    },
  ];

  const data: WeeklyForecastData = {
    method: 'rule',
    label,
    confidence,
    range: { min, max },
    drivers,
    score,
  };

  return {
    data,
    asOf: new Date(candles[candles.length - 1].ts * 1000).toISOString(),
    synthetic: false,
  };
}
