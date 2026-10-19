import type { MacroCalendarArgs, MacroCalendarData } from './types';

/** Empty placeholder: never rendered (the page wraps the panel in `LiveOnly`), and no invented dates. */
export function mockMacroCalendar(_args: MacroCalendarArgs): MacroCalendarData {
  void _args;
  return { upcoming: [], today: '', missing: ['FOMC', 'CPI', 'NFP'] };
}
