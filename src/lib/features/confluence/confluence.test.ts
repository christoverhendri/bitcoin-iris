import { describe, expect, it } from 'vitest';
import { WEIGHTS, macroScore } from './live';

/**
 * The confluence weights and the macro mapping are the terminal's most
 * load-bearing opinions — every panel that shows a "score" is downstream of
 * them. These tests do not claim the mapping is correct; they pin it, so a
 * change to a market view is a deliberate edit with a failing test attached
 * rather than a silent drift.
 */

describe('WEIGHTS', () => {
  it('sums to 1.0', () => {
    const total = Object.values(WEIGHTS).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('gives the still-stubbed ONCHAIN layer the least influence', () => {
    const min = Math.min(...Object.values(WEIGHTS));
    expect(WEIGHTS.ONCHAIN).toBe(min);
  });
});

describe('macroScore', () => {
  it('returns neutral 50 when nothing is available', () => {
    expect(macroScore({ dxyZ: null, vixLevel: null, spx30dPct: null })).toBe(50);
  });

  it('reads a strong dollar as a headwind', () => {
    const strong = macroScore({ dxyZ: 2, vixLevel: null, spx30dPct: null });
    const weak = macroScore({ dxyZ: -2, vixLevel: null, spx30dPct: null });
    expect(strong).toBeLessThan(50);
    expect(weak).toBeGreaterThan(50);
    // ±2σ pins the sub-signal at its bounds.
    expect(strong).toBeCloseTo(0, 6);
    expect(weak).toBeCloseTo(100, 6);
  });

  it('maps VIX on its level, calm high and panic low', () => {
    expect(macroScore({ dxyZ: null, vixLevel: 12, spx30dPct: null })).toBeCloseTo(100, 6);
    expect(macroScore({ dxyZ: null, vixLevel: 25, spx30dPct: null })).toBeCloseTo(50, 6);
    expect(macroScore({ dxyZ: null, vixLevel: 50, spx30dPct: null })).toBeCloseTo(0, 6);
  });

  it('interpolates between the VIX anchors rather than stepping', () => {
    const a = macroScore({ dxyZ: null, vixLevel: 17.5, spx30dPct: null });
    expect(a).toBeGreaterThan(macroScore({ dxyZ: null, vixLevel: 20, spx30dPct: null }));
    expect(a).toBeLessThan(macroScore({ dxyZ: null, vixLevel: 15, spx30dPct: null }));
  });

  it('reads a rising S&P as risk-on', () => {
    expect(macroScore({ dxyZ: null, vixLevel: null, spx30dPct: 10 })).toBeCloseTo(100, 6);
    expect(macroScore({ dxyZ: null, vixLevel: null, spx30dPct: -10 })).toBeCloseTo(0, 6);
    expect(macroScore({ dxyZ: null, vixLevel: null, spx30dPct: 0 })).toBeCloseTo(50, 6);
  });

  it('averages only the sub-signals that are present', () => {
    // A missing input must not be silently treated as neutral: with only the
    // dollar available the layer should read the dollar, not a diluted version.
    const only = macroScore({ dxyZ: 2, vixLevel: null, spx30dPct: null });
    const diluted = macroScore({ dxyZ: 2, vixLevel: 25, spx30dPct: 0 });
    expect(only).toBeCloseTo(0, 6);
    expect(diluted).toBeGreaterThan(only);
  });

  it('stays inside 0-100 for extreme inputs', () => {
    const s = macroScore({ dxyZ: -99, vixLevel: 1, spx30dPct: 999 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
