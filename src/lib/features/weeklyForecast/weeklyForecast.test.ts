import { describe, expect, it } from 'vitest';
import { rowToForecast, type ClfSignalRow } from './transform';
import { toWeeklyForecastLabels } from './present';

const FIXTURE_ROW: ClfSignalRow = {
  as_of: '2026-08-21',
  horizon_days: 7,
  signal: 'NONE',
  p_up: 0.625521,
  t_bear: 0.23,
  t_bull: 0.70,
  threshold_binary: 0.11,
  direction_binary: 'BULL',
  margin: 0.515521,
  gate_pass: { '20': true, '35': true, '40': true },
  per_domain: {
    MacroCrossAsset: 0.739911,
    Universal: 0.511131,
  },
  n_nan_features: {
    MacroCrossAsset: 0,
    Universal: 2,
  },
  rule_method: 'dual_threshold_oof',
  model_name: 'btc_direction_7d_avg_ensemble',
  model_created_utc: '2026-10-15T05:04:50+00:00',
  model_train_end: '2023-05-29',
  model_domains: ['MacroCrossAsset', 'Universal'],
  val_f1_macro: 0.589768,
  test_f1_macro: 0.580448,
  is_synthetic: false,
  created_at: '2026-10-15T06:00:00Z',
};

const DUMMY_CLOSES = [100000, 102000, 101000, 103000, 104000, 105000];

describe('weeklyForecast / rowToForecast', () => {
  it('maps signals correctly: BULL -> BULLISH, BEAR -> BEARISH, NONE -> NEUTRAL / NO SIGNAL', () => {
    const bull = rowToForecast({ ...FIXTURE_ROW, signal: 'BULL' }, DUMMY_CLOSES);
    expect(bull.label).toBe('BULLISH');
    expect(toWeeklyForecastLabels(bull).label).toBe('BULLISH');

    const bear = rowToForecast({ ...FIXTURE_ROW, signal: 'BEAR' }, DUMMY_CLOSES);
    expect(bear.label).toBe('BEARISH');
    expect(toWeeklyForecastLabels(bear).label).toBe('BEARISH');

    const none = rowToForecast({ ...FIXTURE_ROW, signal: 'NONE' }, DUMMY_CLOSES);
    expect(none.label).toBe('NEUTRAL');
    expect(toWeeklyForecastLabels(none).label).toBe('NO SIGNAL');
  });

  it('guarantees that driver contributions sum exactly to composite score', () => {
    const forecast = rowToForecast(FIXTURE_ROW, DUMMY_CLOSES);
    const sumContributions = forecast.drivers.reduce((acc, d) => acc + d.contribution, 0);
    expect(forecast.score).toBeCloseTo(sumContributions, 8);
    expect(forecast.drivers.length).toBe(2);
    expect(forecast.drivers[0].reading).toBe('74.0%');
    expect(forecast.drivers[1].reading).toBe('51.1%');
  });

  it('evaluates staleness correctly for 8 days (fresh) vs 10 days (stale)', () => {
    const baseNow = new Date('2026-10-16T12:00:00Z').getTime();

    // 8 days old -> fresh
    const freshCreatedAt = new Date(baseNow - 8 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = rowToForecast({ ...FIXTURE_ROW, created_at: freshCreatedAt }, DUMMY_CLOSES, baseNow);
    expect(fresh.classifier?.stale).toBe(false);

    // 10 days old -> stale (> 9 days threshold)
    const staleCreatedAt = new Date(baseNow - 10 * 24 * 60 * 60 * 1000).toISOString();
    const stale = rowToForecast({ ...FIXTURE_ROW, created_at: staleCreatedAt }, DUMMY_CLOSES, baseNow);
    expect(stale.classifier?.stale).toBe(true);
  });

  it('computes volatility range strictly without drift in classifier mode', () => {
    const lastClose = DUMMY_CLOSES[DUMMY_CLOSES.length - 1]; // 105000
    const forecast = rowToForecast(FIXTURE_ROW, DUMMY_CLOSES);

    const mid = (forecast.range.min + forecast.range.max) / 2;
    expect(mid).toBeCloseTo(lastClose, 5);
  });
});
