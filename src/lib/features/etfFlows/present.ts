import { fmtPct } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';
import type { EtfFlowsData } from './types';

/**
 * The three things a reader must know before trusting a number on this page.
 * They are not caveats hidden in a tooltip — the panel renders them.
 */
export const ETF_WINDOW_NOTE =
  'This is bitbo’s rolling recent window — typically eight to ten sessions — not ' +
  'cumulative flow since the ETFs launched. The net figure here answers “what has ' +
  'the institutional bid done lately”, never “how much is in these funds”.';

export const ETF_SOURCE_NOTE =
  'Figures are a third party’s transcription of issuer creation/redemption data, ' +
  'scraped from bitbo.io as server-rendered HTML. They have not been reconciled ' +
  'against the issuers’ own filings. The parser validates the table’s shape and ' +
  'checks every row’s funds against the printed total; any mismatch falls back to ' +
  'a badged mock rather than showing a number it cannot stand behind.';

export const ETF_SETTLEMENT_NOTE =
  'ETF creations settle T+1, so the newest row lags spot by a session. A flow print ' +
  'can explain yesterday’s candle, never today’s.';

/** US$ millions, signed, one decimal — the unit bitbo publishes. */
export function fmtUsdM(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`;
  return `${sign}$${abs.toFixed(1)}M`;
}

/** Money in is green, money out is red. No inversion here — flow is direction. */
export function flowTone(v: number): Tone {
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return 'mut';
}

export function streakLabel(d: EtfFlowsData): string {
  if (d.streakDirection === 'flat' || d.streakDays === 0) return 'FLAT';
  return `${d.streakDays}D ${d.streakDirection === 'inflow' ? 'IN' : 'OUT'}`;
}

export function streakTone(d: EtfFlowsData): Tone {
  if (d.streakDirection === 'inflow') return 'up';
  if (d.streakDirection === 'outflow') return 'down';
  return 'mut';
}

export function toEtfLabels(d: EtfFlowsData) {
  const ibit = d.leaderboard.find((f) => f.ticker === 'IBIT');
  return {
    latest: fmtUsdM(d.latestUsdM),
    latestDate: d.latestDate,
    windowNet: fmtUsdM(d.windowNetUsdM),
    windowSessions: `${d.sessions.length} SESSIONS`,
    avgDaily: fmtUsdM(d.sessions.length > 0 ? d.windowNetUsdM / d.sessions.length : 0),
    streak: streakLabel(d),
    biggestDay: fmtUsdM(d.biggestDay.totalUsdM),
    biggestDate: d.biggestDay.date,
    greenDays: `${d.greenDays}/${d.sessions.length}`,
    ibitShare: ibit ? fmtPct(ibit.grossSharePct, false, 1) : '—',
  };
}
