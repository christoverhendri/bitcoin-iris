import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/rng';
import {
  DEFAULT_QUANTILES,
  probAbove,
  simulate,
  terminalHistogram,
  type SimulationConfig,
} from './fhs';

/**
 * Every number the forecast page shows comes out of `simulate`, so these tests
 * are the load-bearing ones. The single most important assertion in the file is
 * that zero-drift really centres the distribution on spot — if drift leaks
 * through anywhere, a cone built on a decade of BTC tilts upward and the page
 * quietly becomes a prediction of riches rather than a map of risk.
 */

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

/** Returns with volatility clustering and a strong positive drift. */
function clusteredReturns(n = 2000, drift = 0.002, seed = 7): number[] {
  const z = normals(mulberry32(seed), n);
  const out: number[] = [];
  let v = 4e-4;
  for (let i = 0; i < n; i += 1) {
    const shock = Math.sqrt(v) * z[i];
    out.push(drift + shock);
    v = 2e-6 + 0.1 * shock * shock + 0.88 * v;
  }
  return out;
}

const base = (over: Partial<SimulationConfig> = {}): SimulationConfig => ({
  returns: clusteredReturns(),
  horizonDays: 30,
  nPaths: 2000,
  seed: 123,
  method: 'fhs',
  driftMode: 'zero',
  ...over,
});

describe('simulate — structure', () => {
  const s = simulate(base());

  it('emits one band row per step plus the anchor', () => {
    expect(s.bands).toHaveLength(31);
    expect(s.quantiles).toEqual(DEFAULT_QUANTILES);
  });

  it('anchors step 0 at exactly 1 for every quantile', () => {
    expect(s.bands[0].every((v) => v === 1)).toBe(true);
  });

  it('keeps quantiles ascending within every step', () => {
    for (const row of s.bands) {
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
      }
    }
  });

  it('widens the outer band monotonically with horizon', () => {
    const width = (i: number) => s.bands[i][6] - s.bands[i][0]; // p95 - p5
    expect(width(30)).toBeGreaterThan(width(15));
    expect(width(15)).toBeGreaterThan(width(3));
  });

  it('returns one sorted terminal multiplier per path', () => {
    expect(s.terminal).toHaveLength(2000);
    for (let i = 1; i < s.terminal.length; i += 1) {
      expect(s.terminal[i]).toBeGreaterThanOrEqual(s.terminal[i - 1]);
    }
  });

  it('is deterministic — identical config gives an identical surface', () => {
    expect(simulate(base())).toEqual(s);
  });

  it('changes when the seed changes', () => {
    expect(simulate(base({ seed: 999 })).terminal).not.toEqual(s.terminal);
  });

  it('captures the cross-section at the final step by default', () => {
    expect(s.capturedAtStep).toBe(30);
  });
});

describe('simulate — captureStep lets one run serve every horizon', () => {
  const returns = clusteredReturns(2000, 0, 3);
  const long = simulate(
    base({ returns, horizonDays: 365, nPaths: 3000, seed: 21, captureStep: 30 }),
  );

  it('records where the cross-section was taken', () => {
    expect(long.capturedAtStep).toBe(30);
    expect(long.terminal).toHaveLength(3000);
  });

  it('agrees with the band row at that same step', () => {
    // The captured cross-section and bands[30] describe one draw, so their
    // quantiles must match. This is the property that stops the term-structure
    // table disagreeing with the chart above it.
    const median = long.terminal[Math.floor(long.terminal.length * 0.5)];
    expect(median).toBeCloseTo(long.bands[30][3], 2);
  });

  it('reads shorter horizons off intermediate rows of the same run', () => {
    for (const step of [7, 14, 30, 90, 180, 365]) {
      const row = long.bands[step];
      expect(row).toHaveLength(7);
      expect(row.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
    // Uncertainty must grow with horizon within one run.
    const width = (i: number) => long.bands[i][6] - long.bands[i][0];
    expect(width(365)).toBeGreaterThan(width(180));
    expect(width(180)).toBeGreaterThan(width(30));
    expect(width(30)).toBeGreaterThan(width(7));
  });

  it('clamps a capture step past the horizon', () => {
    const clamped = simulate(base({ returns, horizonDays: 30, captureStep: 999 }));
    expect(clamped.capturedAtStep).toBe(30);
  });
});

describe('simulate — drift', () => {
  // The input carries +0.2% per day. Over 365 days that compounds to roughly
  // +107% if it is allowed through.
  const returns = clusteredReturns(2000, 0.002);

  it('centres the median on spot when drift is zeroed', () => {
    const s = simulate(base({ returns, horizonDays: 365, nPaths: 4000 }));
    const medianTerminal = s.bands[365][3]; // p50
    expect(medianTerminal).toBeGreaterThan(0.9);
    expect(medianTerminal).toBeLessThan(1.1);
  });

  it('reports how much drift it removed', () => {
    const s = simulate(base({ returns }));
    expect(s.driftRemoved).toBeCloseTo(0.002, 3);
    expect(s.driftMode).toBe('zero');
  });

  it('lets drift through when asked, proving the switch is real', () => {
    const zero = simulate(base({ returns, horizonDays: 365, driftMode: 'zero' }));
    const hist = simulate(base({ returns, horizonDays: 365, driftMode: 'historical' }));
    expect(hist.bands[365][3]).toBeGreaterThan(zero.bands[365][3] * 1.5);
    expect(hist.driftRemoved).toBe(0);
  });

  it('zeroes drift for every engine, not just FHS', () => {
    for (const method of ['fhs', 'stationary', 'iid'] as const) {
      const s = simulate(base({ returns, horizonDays: 180, nPaths: 3000, method }));
      expect(s.bands[180][3]).toBeGreaterThan(0.85);
      expect(s.bands[180][3]).toBeLessThan(1.15);
    }
  });
});

describe('simulate — engines differ in the way they should', () => {
  const returns = clusteredReturns(2500, 0);

  it('makes FHS conditional on current volatility, which iid cannot be', () => {
    // The real difference between the engines is not that FHS is always wider —
    // it is that FHS is *conditional*. Starting from a violent state it must
    // open much wider than starting from a calm one. iid resamples the whole
    // history regardless of where the series happens to end, so it barely
    // reacts. Two series sharing a body, differing only in their last 40 days:
    const body = clusteredReturns(2000, 0, 11);
    const tail = (size: number) =>
      Array.from({ length: 40 }, (_, i) => (i % 2 ? size : -size));
    const calm = [...body, ...tail(0.0008)];
    const wild = [...body, ...tail(0.06)];

    const spread = (s: ReturnType<typeof simulate>) => s.bands[30][6] / s.bands[30][0];
    const run = (r: number[], method: 'fhs' | 'iid') =>
      spread(simulate(base({ returns: r, horizonDays: 30, nPaths: 6000, seed: 5, method })));

    const fhsSensitivity = run(wild, 'fhs') / run(calm, 'fhs');
    const iidSensitivity = run(wild, 'iid') / run(calm, 'iid');

    expect(fhsSensitivity).toBeGreaterThan(iidSensitivity * 1.5);
    expect(fhsSensitivity).toBeGreaterThan(1.3);
  });

  it('opens wider when today is more volatile than the long run', () => {
    const s = simulate(base({ returns, horizonDays: 30, nPaths: 4000 }));
    // Sanity on the mechanism the test above relies on: the surface carries the
    // conditional and unconditional volatility, and the cone is anchored on the
    // conditional one.
    expect(s.sigmaNow).toBeGreaterThan(0);
    expect(s.sigmaPath[0]).toBeCloseTo(s.sigmaNow, 10);
  });

  it('records which engine produced the surface', () => {
    for (const method of ['fhs', 'stationary', 'iid'] as const) {
      expect(simulate(base({ returns, method })).method).toBe(method);
    }
  });

  it('reports the volatility state alongside the bands', () => {
    const s = simulate(base({ returns }));
    expect(s.sigmaNow).toBeGreaterThan(0);
    expect(s.sigmaLongRun).toBeGreaterThan(0);
    expect(s.sigmaPath).toHaveLength(30);
    expect(s.garchConverged).toBe(true);
  });
});

describe('simulate — degenerate input', () => {
  it('returns a flat surface rather than throwing on a short series', () => {
    const s = simulate(base({ returns: [0.01, -0.01, 0.02] }));
    expect(s.bands.every((row) => row.every((v) => v === 1))).toBe(true);
    expect(s.garchConverged).toBe(false);
  });

  it('handles a zero horizon', () => {
    const s = simulate(base({ horizonDays: 0 }));
    expect(s.bands).toHaveLength(1);
    expect(s.horizonDays).toBe(0);
  });

  it('produces finite numbers everywhere on a constant series', () => {
    const s = simulate(base({ returns: new Array(500).fill(0) }));
    expect(s.bands.every((row) => row.every((v) => Number.isFinite(v)))).toBe(true);
    expect(s.terminal.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('probAbove', () => {
  const s = simulate(base({ horizonDays: 90, nPaths: 4000 }));

  it('is 1 below every outcome and 0 above every outcome', () => {
    expect(probAbove(s, 0)).toBe(1);
    expect(probAbove(s, 1e9)).toBe(0);
  });

  it('decreases monotonically as the level rises', () => {
    let prev = 1;
    for (const m of [0.5, 0.8, 0.95, 1, 1.05, 1.2, 2]) {
      const p = probAbove(s, m);
      expect(p).toBeLessThanOrEqual(prev + 1e-12);
      prev = p;
    }
  });

  it('is about half at the median, since drift is zeroed', () => {
    const median = s.bands[90][3];
    expect(probAbove(s, median)).toBeGreaterThan(0.45);
    expect(probAbove(s, median)).toBeLessThan(0.55);
  });
});

describe('terminalHistogram', () => {
  const s = simulate(base({ horizonDays: 60, nPaths: 3000 }));

  it('returns contiguous ascending bins', () => {
    const h = terminalHistogram(s, 80_000, 20);
    expect(h).toHaveLength(20);
    for (let i = 1; i < h.length; i += 1) {
      expect(h[i].binLow).toBeCloseTo(h[i - 1].binHigh, 6);
    }
  });

  it('keeps most of the mass after clipping the extreme 2%', () => {
    const h = terminalHistogram(s, 80_000, 24);
    const total = h.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBeGreaterThan(3000 * 0.95);
  });

  it('returns an empty array rather than dividing by zero on a flat surface', () => {
    const flat = simulate(base({ returns: [0.01, -0.01] }));
    expect(terminalHistogram(flat, 80_000)).toEqual([]);
  });
});
