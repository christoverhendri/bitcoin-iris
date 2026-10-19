import { describe, expect, it } from 'vitest';
import { isoDay, lastDay, toDay, type DailySeries } from './daily';
import { bandsAt, quantileSorted, walkForward, zoneOf } from './powerLaw';
import { fixtureDaily, fixtureSeries, summary } from './__fixtures__/cycle/load';

/** Parity with research/BTC_Halving_Cycle_PowerLaw.ipynb §2.2. */
const s = fixtureSeries();
const wf = walkForward(s);
const last = wf.fits[wf.fits.length - 1];

describe('power-law corridor (notebook parity)', () => {
  it('latest fit and residual quantiles', () => {
    const ref = summary.power_law;
    expect(wf.fits).toHaveLength(ref.refits);
    expect(Math.abs(last.a - ref.a)).toBeLessThan(1e-9);
    expect(Math.abs(last.b - ref.b)).toBeLessThan(1e-9);
    last.residQ.forEach((q, i) => expect(Math.abs(q - ref.resid_quantiles[i])).toBeLessThan(1e-9));
    expect(wf.fits.find((f) => f.refit === '2014-01-01')!.b).toBeCloseTo(ref.b_2014, 9);
    expect(wf.fits.find((f) => f.refit === '2018-01-01')!.b).toBeCloseTo(ref.b_2018, 9);
  });

  it('daily walk-forward percentile and zone match the notebook CSV', () => {
    const ref = fixtureDaily();
    expect(wf.pct).toHaveLength(ref.length);
    expect(isoDay(s.start + wf.offset)).toBe(ref[0].date);
    let maxDiff = 0;
    ref.forEach((r, j) => {
      maxDiff = Math.max(maxDiff, Math.abs(wf.pct[j] - r.pct));
      expect(zoneOf(wf.pct[j])).toBe(r.zone);
    });
    expect(maxDiff).toBeLessThanOrEqual(1e-6);
    expect(wf.pct[wf.pct.length - 1]).toBeCloseTo(summary.power_law.percentile_today, 9);
  });

  it("today's band prices", () => {
    bandsAt(last, lastDay(s)).forEach((v, i) => expect(Math.abs(v / summary.bands_at.today.bands[i] - 1)).toBeLessThan(1e-9));
  });

  it('a new month refits by itself, from the new data', () => {
    // Extend past 1 Nov 2026 at a much lower price.
    const ext: DailySeries = { start: s.start, prices: [...s.prices, ...Array(20).fill(40_000)] };
    const w2 = walkForward(ext);
    const fit = w2.fits[w2.fits.length - 1];
    expect(w2.fits).toHaveLength(wf.fits.length + 1);
    expect(fit.refit).toBe(isoDay(toDay('2026-11-01')));
    expect(fit.a).not.toBe(last.a);
    expect(fit.b).not.toBe(last.b);
    // October's days keep the October fit (no hindsight); November's use the new one.
    expect(w2.pct.slice(0, wf.pct.length)).toEqual(wf.pct);
    expect(w2.pct).toHaveLength(wf.pct.length + 20);
  });

  it('quantile uses numpy linear interpolation', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 12);
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
  });
});
