import type { MonthlyForecastArgs, MonthlyForecastData } from './types';

/**
 * Empty placeholder of the right shape. Never rendered: the page wraps its
 * panels in `LiveOnly`, which replaces a mocked envelope with a one-line note
 * (curation 2026-10-18: no dummy data). Deliberately no invented prices.
 */
export function mockMonthlyForecast(_args: MonthlyForecastArgs): MonthlyForecastData {
  void _args;
  return {
    runId: '',
    runAt: '',
    asOf: '',
    spot: 0,
    horizonDays: 0,
    nPaths: 0,
    method: '',
    priceSource: '',
    sampleDays: 0,
    historyStart: '',
    bands: [],
    paths: [],
    history: [],
    model: {
      engine: '',
      volModel: 'garch',
      alpha: 0,
      beta: 0,
      persistence: 0,
      sigmaNowAnnPct: 0,
      sigmaLongRunAnnPct: 0,
      driftRemovedDaily: 0,
      expectedMovePct: 0,
      rangeP5P95Pct: 0,
      probabilities: [],
      calibrationApplied: false,
      calibrationNote: null,
      volSource: 'garch',
      sigmaGarchAnnPct: 0,
      dvolPct: null,
      vrpFactor: null,
    },
    backtest: null,
    trackRecord: [],
  };
}
