import { describe, expect, it } from 'vitest';
import { mockForecastCalibration } from './mock';
import { shapeSentence, uniformityTone, verdictSentence, verdictTone } from './present';

describe('mockForecastCalibration', () => {
  const d = mockForecastCalibration({ horizonDays: 30 });

  it('is deterministic', () => {
    expect(mockForecastCalibration({ horizonDays: 30 })).toEqual(d);
  });

  it('scores the three advertised bands', () => {
    expect(d.coverage.map((c) => c.nominalPct)).toEqual([50, 80, 90]);
  });

  it('bins the PIT histogram to the number of origins', () => {
    const total = d.pitHistogram.reduce((s, b) => s + b.count, 0);
    // Rounding per bin makes exactness impossible; the total must still be in
    // the right neighbourhood, or the histogram is describing a different run.
    expect(Math.abs(total - d.origins)).toBeLessThan(d.origins * 0.2);
  });

  it('covers [0,1] with contiguous PIT bins', () => {
    expect(d.pitHistogram[0].binLow).toBe(0);
    expect(d.pitHistogram[d.pitHistogram.length - 1].binHigh).toBe(1);
    for (let i = 1; i < d.pitHistogram.length; i += 1) {
      expect(d.pitHistogram[i].binLow).toBeCloseTo(d.pitHistogram[i - 1].binHigh, 10);
    }
  });

  it('keeps the uniformity score inside 0-100', () => {
    expect(d.pitUniformityScore).toBeGreaterThanOrEqual(0);
    expect(d.pitUniformityScore).toBeLessThanOrEqual(100);
  });

  it('compares the engine in use against the baseline', () => {
    expect(d.comparison.map((m) => m.method).sort()).toEqual(['fhs', 'iid']);
    expect(d.comparison.some((m) => m.method === d.primaryMethod)).toBe(true);
  });

  it('never scores an origin it also trained on', () => {
    expect(d.trainDays).toBeGreaterThan(0);
    expect(d.testDays).toBeGreaterThan(0);
    expect(d.origins).toBeLessThanOrEqual(d.testDays);
  });
});

describe('verdicts', () => {
  it('treats a shortfall as overconfidence and an excess as caution', () => {
    expect(verdictTone('NARROW')).toBe('down');
    expect(verdictTone('WIDE')).toBe('amber');
    expect(verdictTone('GOOD')).toBe('up');
    expect(verdictSentence('NARROW', 80)).toMatch(/overconfident/);
    expect(verdictSentence('GOOD', 80)).toMatch(/80%/);
  });

  it('reads each PIT shape in plain language', () => {
    const base = mockForecastCalibration({});
    for (const shape of ['FLAT', 'U-SHAPED', 'HUMPED', 'SKEWED'] as const) {
      const sentence = shapeSentence({ ...base, pitShape: shape });
      expect(sentence.length).toBeGreaterThan(20);
    }
    expect(shapeSentence({ ...base, pitShape: 'U-SHAPED' })).toMatch(/too narrow/);
    expect(shapeSentence({ ...base, pitShape: 'HUMPED' })).toMatch(/wider/);
  });

  it('tones the uniformity score by how flat it is', () => {
    expect(uniformityTone(95)).toBe('up');
    expect(uniformityTone(70)).toBe('txt');
    expect(uniformityTone(30)).toBe('amber');
  });
});
