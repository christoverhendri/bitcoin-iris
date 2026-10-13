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
  bg: '#060b10',
  panel: '#090f15',
  sunk: '#0c141d',
  line: '#203449',
  line2: '#35516d',
  txt: '#e1edf9',
  mut: '#8eabc7',
  dim: '#718aa4',
  up: '#12df93',
  down: '#ff5265',
  blue: '#36a8ff',
  amber: '#ffad22',
  purple: '#ba8dff',
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
