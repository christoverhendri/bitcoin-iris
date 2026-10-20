/**
 * Single source of truth for the IRIS terminal palette.
 *
 * These hex values are duplicated as CSS custom properties in `src/app/globals.css`.
 * `tokens.test.ts` parses that file and asserts byte-equality, because
 * `lightweight-charts` renders to canvas and cannot read CSS custom properties —
 * it has to be configured from these constants instead.
 *
 * "Ember" (2026-10-20): one colour family. A warm black ground, solid warm
 * surfaces, cream ink and a single orange accent. Direction is carried by
 * lightness, not by hue: up is light orange, down is sand. The remaining
 * category tones (blue, amber, purple) are kept as names for the components
 * that use them, but are mapped onto the same family and differ in lightness.
 */
export const TOKENS = {
  bg: '#0b0806',
  panel: '#130e0a',
  sunk: '#1a130e',
  line: '#241a13',
  line2: '#2e2219',
  txt: '#f6eee7',
  mut: '#b9a89a',
  dim: '#9a887a',
  up: '#ffb27a',
  down: '#c9b8aa',
  blue: '#e9c4a6',
  amber: '#ffa05c',
  purple: '#b8663a',
} as const;

/** Hover background for nav / indicator buttons. */
export const HOVER_BG = '#1f1712';
/** Active nav item background. */
export const ACTIVE_NAV_BG = '#261b13';
/** Active timeframe pill / news filter background. */
export const ACTIVE_PILL_BG = '#2a1e15';
/** Brand accent (active navigation, focus ring, primary highlights). */
export const ACCENT = '#ff6b1f';

export type TokenName = keyof typeof TOKENS;

/** Semantic tone used by KeyValueRow, Tag, StatTile — maps to a CSS var. */
export type Tone = 'txt' | 'mut' | 'dim' | 'up' | 'down' | 'blue' | 'amber' | 'purple';

export const toneVar = (t: Tone) => `var(--${t})`;

/** Sign-driven tone. Zero counts as neutral text, not green. */
export const signTone = (n: number): Tone => (n > 0 ? 'up' : n < 0 ? 'down' : 'txt');
