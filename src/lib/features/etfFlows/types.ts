/** One fund's contribution over the visible window. */
export interface EtfFundRow {
  /** Ticker, e.g. `IBIT`. */
  ticker: string;
  /** Net flow across the window, US$ millions. Signed. */
  netUsdM: number;
  /** Most recent session's flow, US$ millions. Signed. */
  latestUsdM: number;
  /** Share of the window's total gross flow, 0-100. Always positive. */
  grossSharePct: number;
}

/** One session of aggregate flow. */
export interface EtfFlowSession {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  ts: number;
  /** Net across every fund, US$ millions. Signed. */
  totalUsdM: number;
  /** Per-fund breakdown for the session, US$ millions. Signed. */
  byFund: Record<string, number>;
}

export interface EtfFlowsData {
  /** Tickers in publication order. */
  funds: string[];
  /** Sessions, newest first. Typically 8-10 — a rolling window, not history. */
  sessions: EtfFlowSession[];
  /** Newest session's net, US$ millions. */
  latestUsdM: number;
  /** ISO date of the newest session. */
  latestDate: string;
  /** Sum across every session in the window, US$ millions. */
  windowNetUsdM: number;
  /**
   * Consecutive sessions, counting back from the newest, sharing the newest
   * session's sign. Zero when the newest session is flat.
   */
  streakDays: number;
  /** `'inflow' | 'outflow' | 'flat'` — the direction that streak is running. */
  streakDirection: 'inflow' | 'outflow' | 'flat';
  /** Largest absolute single-session net in the window. */
  biggestDay: { date: string; totalUsdM: number };
  /** Per-fund leaderboard, sorted by net descending. */
  leaderboard: EtfFundRow[];
  /** Number of sessions in the window that were net positive. */
  greenDays: number;
}

export interface EtfFlowsArgs {
  /** Cap on sessions returned. The upstream window is short regardless. */
  limit?: number;
}
