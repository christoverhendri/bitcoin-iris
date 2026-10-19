import type { HalvingCycleArgs, HalvingCycleData } from './types';

/**
 * Empty placeholder of the right shape. Never rendered: the page wraps its
 * panels in `LiveOnly`, which replaces a mocked envelope with a one-line note.
 * Deliberately no invented cycles or dates.
 */
export function mockHalvingCycle(_args: HalvingCycleArgs): HalvingCycleData {
  void _args;
  return {
    priceSource: 'Coin Metrics',
    lastDate: '',
    priceNow: 0,
    today: '',
    halvingsFromChain: false,
    analysis: {
      cycles: [],
      current: null,
      durations: { halvingToTop: [], topToBottom: [], topToTop: [], bottomToTop: [] },
      intervals: { halvingToTop: null, topToBottom: null, topToTop: null, bottomToTop: null },
      completed: 0,
      projections: [],
      nextHalving: null,
      backtest: [],
    },
    history: [],
  };
}
