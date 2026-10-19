import { describe, expect, it } from 'vitest';
import { predictive, tCdf, tPpf } from './studentT';

describe('Student-t', () => {
  it('matches scipy reference quantiles', () => {
    expect(tPpf(0.975, 2)).toBeCloseTo(4.302653, 5);
    expect(tPpf(0.975, 3)).toBeCloseTo(3.182446, 5);
    expect(tPpf(0.9, 2)).toBeCloseTo(1.885618, 5);
    expect(tPpf(0.025, 2)).toBeCloseTo(-4.302653, 5);
  });

  it('is symmetric around zero', () => {
    for (const df of [1, 2, 3, 10]) expect(tCdf(0, df)).toBe(0.5);
    expect(tCdf(1.5, 4) + tCdf(-1.5, 4)).toBeCloseTo(1, 12);
    expect(tCdf(tPpf(0.8, 5), 5)).toBeCloseTo(0.8, 12);
  });

  it('predictive interval: mean ± t·sd·√(1+1/n)', () => {
    const d = predictive([406, 364, 366])!;
    expect(d.df).toBe(2);
    expect(d.loc).toBeCloseTo(378.6667, 4);
    // Notebook: top→bottom 80% 327–430, 95% 261–496.
    expect(Math.round(d.ppf(0.1))).toBe(327);
    expect(Math.round(d.ppf(0.9))).toBe(430);
    expect(Math.round(d.ppf(0.025))).toBe(261);
    expect(Math.round(d.ppf(0.975))).toBe(496);
    expect(predictive([400])).toBeNull();
  });
});
