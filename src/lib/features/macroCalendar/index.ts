import { defineFeature } from '@/lib/defineFeature';
import { MAX_AGE_SEC } from '@/lib/maxAge';
import { fetchMacroCalendar } from './live';
import { mockMacroCalendar } from './mock';
import type { MacroCalendarArgs, MacroCalendarData } from './types';

export const getMacroCalendar = defineFeature<MacroCalendarArgs, MacroCalendarData>({
  key: 'macroCalendar',
  source: 'fred',
  live: fetchMacroCalendar,
  mock: mockMacroCalendar,
  maxAgeSec: MAX_AGE_SEC.macroCalendar,
});

export type { MacroCalendarArgs, MacroCalendarData };
export type { MacroEvent, MacroEventKind } from './types';
