import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/rng';
import { ewmaSigma, fitGarch11, forecastSigmaPath } from './garch';

/**
 * The volatility filter is what makes the whole forecast defensible, so these
 * tests check that it recovers a process it was given, that it refuses to
 * pretend when it cannot, and — most importantly — that its forecast path
 * mean-reverts instead of growing like sqrt(t).
 */

/** Box-Muller from a seeded uniform, so the fixtures are reproducible. */
function normals(rand: () => number, n: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1));
    out.push(r * Math.cos(2 * Math.PI * u2));
    if (out.length < n) out.push(r * Math.sin(2 * Math.PI * u2));
  }
  return out.slice(0, n);
}

/** Generate a GARCH(1,1) series with known parameters. */
function garchSeries(
  n: number,
  omega: number,
  alpha: number,
  beta: number,
  seed = 42,
): number[] {
  const z = normals(mulberry32(seed), n);
  const out: number[] = [];
  let v = omega / (1 - alpha - beta);
  for (let i = 0; i < n; i += 1) {
    const r = Math.sqrt(v) * z[i];
    out.push(r);
    v = omega + alpha * r * r + beta * v;
  }
  return out;
}

describe('ewmaSigma', () => {
  it('returns one sigma per observation, all positive', () => {
    const r = garchSeries(500, 2e-6, 0.08, 0.9);
    const s = ewmaSigma(r);
    expect(s).toHaveLength(r.length);
    expect(s.every((x) => Number.isFinite(x) && x > 0)).toBe(true);
  });

  it('rises after a shock', () => {
    const calm = new Array(100).fill(0.001);
    const series = [...calm, 0.25, ...calm];
    const s = ewmaSigma(series);
    // The sigma immediately after the shock must exceed the one just before it.
    expect(s[101]).toBeGreaterThan(s[100]);
  });

  it('survives an empty series', () => {
    expect(ewmaSigma([])).toEqual([]);
  });
});

describe('fitGarch11', () => {
  const TRUE = { omega: 2e-6, alpha: 0.08, beta: 0.9 };
  const series = garchSeries(3000, TRUE.omega, TRUE.alpha, TRUE.beta);
  const fit = fitGarch11(series);

  it('converges on a well-behaved GARCH sample', () => {
    expect(fit.converged).toBe(true);
    expect(fit.method).toBe('garch');
  });

  it('recovers persistence close to the truth', () => {
    // Individual alpha/beta trade off against each other; their sum is the
    // quantity that is actually identified, and it is what drives the forecast.
    expect(fit.persistence).toBeCloseTo(TRUE.alpha + TRUE.beta, 1);
  });

  it('keeps the process stationary', () => {
    expect(fit.persistence).toBeLessThan(1);
    expect(fit.alpha).toBeGreaterThan(0);
    expect(fit.beta).toBeGreaterThanOrEqual(0);
    expect(fit.omega).toBeGreaterThan(0);
  });

  it('produces a positive finite sigma for every observation', () => {
    expect(fit.sigma).toHaveLength(series.length);
    expect(fit.sigma.every((s) => Number.isFinite(s) && s > 0)).toBe(true);
    expect(fit.lastSigma).toBeGreaterThan(0);
    expect(fit.longRunSigma).toBeGreaterThan(0);
  });

  it('is deterministic — same input, identical output', () => {
    expect(fitGarch11(series)).toEqual(fit);
  });

  it('falls back to EWMA on a series too short to fit', () => {
    const short = fitGarch11(series.slice(0, 50));
    expect(short.converged).toBe(false);
    expect(short.method).toBe('ewma');
    expect(short.sigma).toHaveLength(50);
  });

  it('falls back to EWMA on a constant series rather than dividing by zero', () => {
    const flat = fitGarch11(new Array(500).fill(0));
    expect(flat.converged).toBe(false);
    expect(flat.lastSigma).toBeGreaterThan(0);
    expect(Number.isFinite(flat.lastSigma)).toBe(true);
  });
});

describe('forecastSigmaPath', () => {
  const fit = fitGarch11(garchSeries(3000, 2e-6, 0.08, 0.9));

  it('mean-reverts toward the long-run sigma rather than scaling with sqrt(t)', () => {
    const path = forecastSigmaPath(fit, 365);
    const far = path[path.length - 1];
    // The whole reason GARCH is here: a sqrt(t) rule would put the 365th step at
    // roughly 19x the first. Mean reversion pins it near the unconditional level.
    expect(far).toBeCloseTo(fit.longRunSigma, 4);
    expect(far).toBeLessThan(fit.lastSigma * 3);
  });

  it('moves monotonically from today toward the long-run level', () => {
    const path = forecastSigmaPath(fit, 200);
    const startsBelow = path[0] < fit.longRunSigma;
    for (let i = 1; i < path.length; i += 1) {
      if (startsBelow) expect(path[i]).toBeGreaterThanOrEqual(path[i - 1] - 1e-12);
      else expect(path[i]).toBeLessThanOrEqual(path[i - 1] + 1e-12);
    }
  });

  it('starts at the conditional sigma for the next step', () => {
    expect(forecastSigmaPath(fit, 5)[0]).toBeCloseTo(fit.lastSigma, 10);
  });

  it('returns exactly `horizon` positive values', () => {
    const path = forecastSigmaPath(fit, 30);
    expect(path).toHaveLength(30);
    expect(path.every((s) => Number.isFinite(s) && s > 0)).toBe(true);
  });
});
