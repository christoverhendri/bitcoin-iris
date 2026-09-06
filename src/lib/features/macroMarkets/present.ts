import { fmtPct } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';
import type { MacroMarketsData, MarketSeries } from './types';

export const CORR_NOTE =
  'Correlation of the last 30 daily returns against BTC’s, measured over the ' +
  'calendar days both markets actually traded. Equities trade about 252 sessions ' +
  'a year and BTC trades 365, so the two are matched by date rather than by ' +
  'position — pairing them by index would compare a Tuesday close with a Saturday ' +
  'one. Fewer than 30 overlapping sessions reports “—”, not a short-sample number.';

export const Z_NOTE =
  'Z-score places the current level inside this instrument’s own trailing year, in ' +
  'standard deviations. It says where a market sits relative to its recent past — ' +
  'it is not a valuation and carries no view on what happens next.';

export const YAHOO_NOTE =
  'Yahoo Finance’s chart endpoint is public but undocumented and unsupported; it ' +
  'can change without notice. Holidays and halts arrive as null closes and are ' +
  'dropped rather than carried forward. Any symbol that fails is listed, not hidden.';

/** Level formatting differs by instrument: a yield is not an index. */
export function fmtLevel(s: MarketSeries): string {
  if (s.kind === 'rate') return `${s.level.toFixed(2)}%`;
  if (s.level >= 1000) return s.level.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return s.level.toFixed(2);
}

/**
 * Correlation tone is about strength, not desirability — a strong negative
 * correlation is as informative as a strong positive one, so both read as
 * signal and only the weak middle is muted.
 */
export function corrTone(r: number | null): Tone {
  if (r === null) return 'dim';
  if (r >= 0.4) return 'up';
  if (r <= -0.4) return 'down';
  return 'mut';
}

/** Beyond ±2σ a market is somewhere it has rarely been this year. */
export function zTone(z: number | null): Tone {
  if (z === null) return 'dim';
  if (z >= 2 || z <= -2) return 'amber';
  return 'txt';
}

export function fmtCorr(r: number | null): string {
  return r === null ? '—' : (r >= 0 ? '+' : '') + r.toFixed(2);
}

export function fmtZ1y(z: number | null): string {
  return z === null ? '—' : `${z >= 0 ? '+' : ''}${z.toFixed(2)}σ`;
}

export function toMacroMarketRows(d: MacroMarketsData) {
  return d.series.map((s) => ({
    key: s.key,
    label: s.label,
    symbol: s.symbol,
    level: fmtLevel(s),
    change1d: fmtPct(s.change1dPct, true, 2),
    change5d: fmtPct(s.change5dPct, true, 2),
    change30d: fmtPct(s.change30dPct, true, 2),
    corr: fmtCorr(s.corr30d),
    corrRaw: s.corr30d,
    z: fmtZ1y(s.z1y),
    zRaw: s.z1y,
    points: s.points,
    raw: s,
  }));
}
