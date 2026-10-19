import { describe, expect, it } from 'vitest';
import { analyzeCycles, avgMiss, type HalvingPoint } from './cycle';
import { HALVINGS_FALLBACK } from './config';
import { lastDay, toDay, type DailySeries } from './daily';
import { fixtureSeries, summary } from './__fixtures__/cycle/load';

const s = fixtureSeries();
const HALVINGS: HalvingPoint[] = HALVINGS_FALLBACK.map((h) => ({ ...h }));
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const NOW = ms(summary.ref_date);
const run = (series: DailySeries, o: Partial<{ halvings: HalvingPoint[]; blockHeight: number | null; liveBlockMinutes: number | null; nowMs: number }> = {}) =>
  analyzeCycles(series, { halvings: HALVINGS, blockHeight: summary.block_height, liveBlockMinutes: 9.85, nowMs: NOW, ...o });
const dayDiff = (a: string, b: string) => Math.abs(toDay(a) - toDay(b));

/** Append a straight-line path (log-linear) from the last close to `to` over `days` days, `hold` more days flat. */
function extend(base: DailySeries, legs: { to: number; days: number }[]): DailySeries {
  const prices = [...base.prices];
  for (const leg of legs) {
    const from = prices[prices.length - 1];
    for (let i = 1; i <= leg.days; i += 1) prices.push(from * (leg.to / from) ** (i / leg.days));
  }
  return { start: base.start, prices };
}
const isoOf = (series: DailySeries) => new Date(lastDay(series) * 86_400_000).toISOString().slice(0, 10);

const base = run(s);

describe('halving cycles — notebook parity', () => {
  it('same tops, bottoms and states', () => {
    expect(base.cycles).toHaveLength(4);
    base.cycles.forEach((c, i) => {
      const ref = summary.cycles[i];
      expect(c.top!.date).toBe(ref.top_date);
      expect(c.bottom!.date).toBe(ref.bottom_date);
      expect(Math.abs(c.top!.price / ref.top_price - 1)).toBeLessThan(1e-4);
      expect(c.bottomConfirmed).toBe(ref.bottom_confirmed);
    });
    expect(base.cycles.slice(0, 3).map((c) => c.status)).toEqual(['SIKLUS SELESAI', 'SIKLUS SELESAI', 'SIKLUS SELESAI']);
    expect(base.completed).toBe(3);
  });

  it('durations and 80% intervals', () => {
    const asMap = (xs: { label: string; value: number }[]) => Object.fromEntries(xs.map((x) => [x.label.replace('→', '-'), x.value]));
    expect(asMap(base.durations.halvingToTop)).toEqual(summary.durations_days.halving_to_top);
    expect(asMap(base.durations.topToBottom)).toEqual(summary.durations_days.top_to_bottom);
    expect(asMap(base.durations.topToTop)).toEqual(summary.durations_days.top_to_top);
    expect(asMap(base.durations.bottomToTop)).toEqual(summary.durations_days.bottom_to_top);
    expect(base.intervals.topToBottom!.p80[0]).toBeCloseTo(summary.duration_intervals.top_to_bottom.p80[0], 5);
    expect(base.intervals.topToTop!.p80[1]).toBeCloseTo(summary.duration_intervals.top_to_top.p80[1], 5);
  });

  it('backtest guesses and mean misses', () => {
    const ours = base.backtest.filter((r) => r.method !== 'CHAIN').map((r) => ({ target: `${r.target} ${r.cycle}`, method: r.method, guess: r.guess, miss: r.missDays }));
    const ref = summary.backtest.map((r: { target: string; method: string; guess: string; miss_days: number }) => ({ target: r.target, method: r.method, guess: r.guess, miss: r.miss_days }));
    expect(ours).toEqual(ref);
    expect([avgMiss(base.backtest, 'A'), avgMiss(base.backtest, 'B'), avgMiss(base.backtest, 'C'), avgMiss(base.backtest, 'BOTTOM')]).toEqual([35, 102, 4, 30]);
  });

  it('next halving with the notebook block time (9.85 min) and day', () => {
    expect(base.nextHalving!.height).toBe(1_050_000);
    expect(base.nextHalving!.blocksLeft).toBe(77_894);
    expect(dayDiff(base.nextHalving!.center, summary.next_halving_est['9.85'])).toBeLessThanOrEqual(1);
  });
});

describe('halving cycles — time transitions', () => {
  it('T1: fixture as is → TOP SEMENTARA; bottom, next top and halving 5 projected', () => {
    expect(base.current!.status).toBe('TOP SEMENTARA');
    expect(base.current!.top!.kind).toBe('provisional');
    expect(base.projections.map((p) => p.key)).toEqual(['bottom', 'nextTop']);
    const bottom = base.projections[0].primary;
    expect(dayDiff(bottom.center, '2026-10-19')).toBeLessThanOrEqual(1);
    expect(dayDiff(bottom.p80[0], '2026-08-29')).toBeLessThanOrEqual(1);
    expect(dayDiff(bottom.p80[1], '2026-12-10')).toBeLessThanOrEqual(1);
    expect(bottom.flag).toBeNull();
    expect(bottom.avgMissDays).toBe(30);
    const next = base.projections[1];
    expect(next.primary.method).toBe('B');
    expect(dayDiff(next.primary.center, summary.next_top.B.center)).toBeLessThanOrEqual(1);
    expect(next.cross!.method).toBe('A');
    expect(dayDiff(next.cross!.center, summary.next_top.A.center)).toBeLessThanOrEqual(1);
  });

  it('T2: new low $50K then +100% to $100K → bottom moves and is confirmed; next-top projection replaces the bottom one', () => {
    const r = run(extend(s, [{ to: 50_000, days: 30 }, { to: 100_000, days: 60 }]));
    expect(r.current!.bottom!.price).toBeCloseTo(50_000, 6);
    expect(r.current!.bottomConfirmed).toBe(true);
    expect(r.current!.status).toBe('BOTTOM TERKONFIRMASI');
    expect(r.projections.map((p) => p.key)).toEqual(['nextTop']);
    expect(r.projections[0].cross!.method).toBe('C');
    // The confirmed bottom now counts in the top→bottom statistics.
    expect(r.durations.topToBottom.map((d) => d.label)).toEqual(['1', '2', '3', '4']);
  });

  it('T3: block 1,050,000 mined 2028-04-03, price still under the 2025 top → cycle 5 MENUNGGU TOP, target 1,260,000', () => {
    const ext = extend(s, [{ to: 90_000, days: 540 }]);
    const halvings = [...HALVINGS, { height: 1_050_000, date: '2028-04-03' }];
    const r = run(ext, { halvings, blockHeight: 1_050_000, nowMs: ms(isoOf(ext)) });
    expect(r.cycles).toHaveLength(5);
    expect(r.current!.index).toBe(5);
    expect(r.current!.status).toBe('MENUNGGU TOP');
    expect(r.cycles[3].top).toMatchObject({ date: '2025-10-06', kind: 'provisional' });
    expect(r.nextHalving!.height).toBe(1_260_000);
    expect(r.projections.map((p) => [p.key, p.primary.method])).toEqual([
      ['top', 'B'],
      ['bottom', 'CHAIN'],
    ]);
  });

  it('T4: −60% from the 2025 top, then a new ATH → the 2025 top is final and its cycle complete', () => {
    const r = run(extend(s, [{ to: 45_000, days: 60 }, { to: 130_000, days: 200 }]));
    expect(r.cycles[3].top).toMatchObject({ date: '2025-10-06', kind: 'final' });
    expect(r.cycles[3].status).toBe('SIKLUS SELESAI');
    expect(r.completed).toBe(4);
    expect(r.durations.topToBottom.map((d) => d.label)).toContain('4');
  });

  it('T5: new ATH before a 40% fall → the top moves; the projection follows it', () => {
    const up = extend(s, [{ to: 150_000, days: 120 }]);
    const r1 = run(up);
    expect(r1.current!.top).toBeNull();
    expect(r1.current!.athPending!.price).toBeCloseTo(150_000, 6);
    expect(r1.current!.status).toBe('MENUNGGU TOP');
    const down = extend(up, [{ to: 85_000, days: 90 }]);
    const r2 = run(down);
    expect(r2.current!.top).toMatchObject({ date: isoOf(up), kind: 'provisional' });
    expect(r2.current!.status).toBe('TOP SEMENTARA');
    expect(toDay(r2.projections[0].primary.center)).toBeGreaterThan(toDay(base.projections[0].primary.center));
  });

  it('T6: now past the 80% upper edge without confirmation → flagged; past 95% → outside the pattern', () => {
    expect(run(s, { nowMs: ms('2026-12-20') }).projections[0].primary.flag).toBe('LEWAT JENDELA PROYEKSI');
    expect(run(s, { nowMs: ms('2027-03-01') }).projections[0].primary.flag).toBe('DI LUAR POLA HISTORIS — POLA SIKLUS MUNGKIN BERUBAH');
  });

  it('without a block height: no halving estimate and no method-B next top (nothing invented)', () => {
    const r = run(s, { blockHeight: null });
    expect(r.nextHalving).toBeNull();
    expect(r.projections.find((p) => p.key === 'nextTop')!.primary.method).toBe('A');
  });
});
