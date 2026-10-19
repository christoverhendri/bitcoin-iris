import type { PowerLawArgs, PowerLawData } from './types';

/**
 * Empty placeholder of the right shape. Never rendered (pages wrap panels in
 * `LiveOnly`); deliberately no invented percentiles or bands.
 */
export function mockPowerLaw(_args: PowerLawArgs): PowerLawData {
  void _args;
  return {
    priceSource: 'Coin Metrics',
    lastDate: '',
    priceNow: 0,
    today: { pct: 0, zone: 'Wajar', bands: [] },
    fit: { refit: '', a: 0, b: 0, residQ: [] },
    bHistory: [],
    series: [],
  };
}
