/**
 * Single source of truth for the IRIS terminal palette.
 *
 * These hex values are duplicated as CSS custom properties in `src/app/globals.css`.
 * `tokens.test.ts` parses that file and asserts byte-equality, because
 * `lightweight-charts` renders to canvas and cannot read CSS custom properties —
 * it has to be configured from these constants instead.
 *
 * IRIS amber terminal palette; see docs/DESIGN_TOKENS.md.
 */
export const TOKENS = {
  bg: '#000000',
  panel: '#080808',
  sunk: '#101010',
  line: '#303030',
  line2: '#4a4a4a',
  txt: '#eeeeee',
  mut: '#aaaaaa',
  dim: '#858585',
  up: '#37e76d',
  down: '#ff4545',
  blue: '#48bfff',
  amber: '#ff9d00',
  purple: '#c898ff',
} as const;

/** Hover background for nav / indicator buttons (not a :root var in the original). */
export const HOVER_BG = '#242019';
/** Active nav item background. */
export const ACTIVE_NAV_BG = '#382600';
/** Active timeframe pill / news filter background. */
export const ACTIVE_PILL_BG = '#183a60';

export type TokenName = keyof typeof TOKENS;

/** Semantic tone used by KeyValueRow, Tag, StatTile — maps to a CSS var. */
export type Tone = 'txt' | 'mut' | 'dim' | 'up' | 'down' | 'blue' | 'amber' | 'purple';

export const toneVar = (t: Tone) => `var(--${t})`;

/** Sign-driven tone. Zero counts as neutral text, not green. */
export const signTone = (n: number): Tone => (n > 0 ? 'up' : n < 0 ? 'down' : 'txt');
