import { describe, expect, it } from 'vitest';
import { FORECAST_HORIZONS, HORIZON_SPEC } from '@/lib/nav';
import { mockPriceDistribution } from './mock';

/**
 * The mock is what renders whenever the upstream is unreachable, so it has to
 * satisfy the same contract as the live path — same shape, same six horizons,
 * same drift-free centring — or a network outage would silently change what the
 * page claims.
 */

describe('mockPriceDistribution', () => {
  const d = mockPriceDistribution({ horizonDays: 30 });

  it('is deterministic, which is what stops a hydration mismatch', () => {
    expect(mockPriceDistribution({ horizonDays: 30 })).toEqual(d);
  });

  it('always publishes all six horizons regardless of the one selected', () => {
    for (const h of [7, 30, 365]) {
      const out = mockPriceDistribution({ horizonDays: h });
      expect(out.termStructure).toHaveLength(FORECAST_HORIZONS.length);
      expect(out.termStructure.map((b) => b.key)).toEqual([...FORECAST_HORIZONS]);
    }
  });

  it('keeps the median on spot, matching the live path’s zero drift', () => {
    for (const b of d.termStructure) {
      expect(b.p50).toBeCloseTo(d.spot, 0);
    }
  });

  it('orders the percentiles within every horizon', () => {
    for (const b of d.termStructure) {
      expect(b.p5).toBeLessThan(b.p25);
      expect(b.p25).toBeLessThan(b.p50);
      expect(b.p50).toBeLessThan(b.p75);
      expect(b.p75).toBeLessThan(b.p95);
    }
  });

  it('widens with horizon', () => {
    const byDays = [...d.termStructure].sort((a, b) => a.days - b.days);
    for (let i = 1; i < byDays.length; i += 1) {
      expect(byDays[i].rangePct).toBeGreaterThan(byDays[i - 1].rangePct);
    }
  });

  it('counts non-overlapping windows honestly', () => {
    for (const b of d.termStructure) {
      expect(b.nonOverlappingWindows).toBe(Math.floor(d.sampleDays / b.days));
    }
    // The point the panel exists to make: a year drawn from a decade rests on
    // roughly ten independent observations, not thousands.
    const oneYear = d.termStructure.find((b) => b.days === 365)!;
    expect(oneYear.nonOverlappingWindows).toBeLessThan(20);
  });

  it('emits one band row per step, anchored at 1', () => {
    expect(d.bands).toHaveLength(31);
    expect(d.bands[0].every((v) => v === 1)).toBe(true);
    expect(d.quantiles).toHaveLength(7);
  });

  it('labels the selected horizon from the shared spec', () => {
    for (const key of FORECAST_HORIZONS) {
      const out = mockPriceDistribution({ horizonDays: HORIZON_SPEC[key].days });
      expect(out.horizonLabel).toBe(HORIZON_SPEC[key].label);
      expect(out.bands).toHaveLength(HORIZON_SPEC[key].days + 1);
    }
  });

  it('declares zero drift, so the mock cannot imply a direction', () => {
    expect(d.driftMode).toBe('zero');
  });

  it('produces a usable histogram', () => {
    expect(d.terminalHistogram.length).toBeGreaterThan(10);
    for (let i = 1; i < d.terminalHistogram.length; i += 1) {
      expect(d.terminalHistogram[i].binLow).toBeCloseTo(
        d.terminalHistogram[i - 1].binHigh,
        6,
      );
    }
  });

  it('gives probabilities that fall as the level rises', () => {
    const sorted = [...d.probabilityLevels].sort((a, b) => a.price - b.price);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].probAbove).toBeLessThanOrEqual(sorted[i - 1].probAbove + 1e-9);
    }
  });
});
