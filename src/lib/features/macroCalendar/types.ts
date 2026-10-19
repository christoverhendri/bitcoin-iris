export type MacroEventKind = 'FOMC' | 'CPI' | 'NFP';

export interface MacroEvent {
  kind: MacroEventKind;
  /** UTC date of the release / rate decision. */
  date: string;
  /** FOMC meeting with a Summary of Economic Projections. */
  sep?: boolean;
}

export interface MacroCalendarData {
  /** Next scheduled events, soonest first. */
  upcoming: MacroEvent[];
  /** Server "today" (UTC), for the countdowns. */
  today: string;
  /** Sources that failed this render (their events are missing, not invented). */
  missing: MacroEventKind[];
}

export type MacroCalendarArgs = { limit?: number };
