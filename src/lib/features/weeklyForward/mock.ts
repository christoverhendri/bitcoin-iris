import { weeklyForward } from '@/lib/forward/stats';
import type { WeeklyForward, WeeklyForwardArgs } from './types';

/** Empty series. Never rendered (the page hides mocked panels); no invented outcomes. */
export function mockWeeklyForward(_args: WeeklyForwardArgs): WeeklyForward {
  void _args;
  return weeklyForward([]);
}
