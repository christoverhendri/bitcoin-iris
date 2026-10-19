/**
 * Halving cycles, recomputed from the price series and the chain on every
 * render — nothing on the page is typed in (IRIS_koreksi_auto_compute.md).
 * Pure, no I/O: "now" and the block data are passed in.
 *
 * Port of research/BTC_Halving_Cycle_PowerLaw.ipynb Part 1, plus the
 * correction's status rules:
 *   - FINAL top: an ATH followed by a ≥60% fall and later a new ATH.
 *   - PROVISIONAL top: the running cycle's ATH once price is ≥40% below it;
 *     moves by itself when a new ATH prints.
 *   - Bottom: lowest close after the top (until the next ATH). CONFIRMED once
 *     price has risen ≥ +100% from it; a lower close moves the bottom and
 *     resets that.
 * Parity with the notebook and the time-transition cases (T1–T6) are in
 * `cycle.test.ts`.
 *
 * No machine learning on purpose: a handful of cycles fits any model perfectly
 * and means nothing; a mean plus a t interval plus a backtest is what they support.
 */
import { mulberry32 } from '@/lib/rng';
import * as C from './config';
import { isoDay, lastDay, toDay, type DailySeries } from './daily';
import { quantileSorted } from './powerLaw';
import { mean, predictive, type Predictive } from './studentT';

const DAY_MS = 86_400_000;

export interface Turn {
  date: string;
  price: number;
}

export interface HalvingPoint {
  height: number;
  date: string;
  /** Block time in epoch seconds, when known. */
  ts?: number | null;
}

export type CycleStatus = 'MENUNGGU TOP' | 'TOP SEMENTARA' | 'BOTTOM TERKONFIRMASI' | 'SIKLUS SELESAI';

export interface Cycle {
  /** 1 = the first halving (block 210,000). */
  index: number;
  halving: string;
  top: (Turn & { kind: 'final' | 'provisional' }) | null;
  /** Highest close of this cycle while it is not yet a top (less than 40% below it). */
  athPending: Turn | null;
  bottom: Turn | null;
  bottomConfirmed: boolean;
  /** Highest close since the bottom ÷ bottom − 1. */
  riseFromBottom: number | null;
  status: CycleStatus;
}

interface Point {
  day: number;
  price: number;
}

/** Every ATH followed by a ≥ `minDrawdown` fall before the next ATH (with the day it was broken), plus the open peak. */
export function findMajorTops(s: DailySeries, minDrawdown = C.MAJOR_TOP_DRAWDOWN) {
  const tops: { peak: Point; trough: Point; brokenDay: number }[] = [];
  let peak: Point = { day: s.start, price: s.prices[0] };
  let trough: Point = { ...peak };
  s.prices.forEach((p, i) => {
    const day = s.start + i;
    if (p > peak.price) {
      if (1 - trough.price / peak.price >= minDrawdown) tops.push({ peak, trough, brokenDay: day });
      peak = { day, price: p };
      trough = { day, price: p };
    } else if (p < trough.price) {
      trough = { day, price: p };
    }
  });
  return { tops, open: { peak, trough } };
}

const turn = (p: Point): Turn => ({ date: isoDay(p.day), price: p.price });

function maxBetween(s: DailySeries, fromDay: number, toDayIncl: number): number {
  let m = -Infinity;
  for (let d = Math.max(fromDay, s.start); d <= Math.min(toDayIncl, lastDay(s)); d += 1) m = Math.max(m, s.prices[d - s.start]);
  return m;
}

/** One cycle per halving that has happened, each with its top, bottom and status. */
export function findCycles(s: DailySeries, halvings: readonly HalvingPoint[]): Cycle[] {
  const { tops, open } = findMajorTops(s);
  const today = lastDay(s);
  return halvings.map((h, i): Cycle => {
    const start = toDay(h.date);
    const end = i + 1 < halvings.length ? toDay(halvings[i + 1].date) : today + 1;
    const base = { index: i + 1, halving: h.date, top: null, athPending: null, bottom: null, bottomConfirmed: false, riseFromBottom: null };
    const cand = tops.filter((t) => t.peak.day >= start && t.peak.day < end);
    let top: Cycle['top'] = null;
    let trough: Point | null = null;
    let windowEnd = today;
    if (cand.length > 0) {
      const pick = cand.reduce((a, b) => (b.peak.price > a.peak.price ? b : a));
      top = { ...turn(pick.peak), kind: 'final' };
      trough = pick.trough;
      windowEnd = pick.brokenDay;
    } else if (open.peak.day >= start && open.peak.day < end) {
      if (1 - open.trough.price / open.peak.price >= C.TOP_CONFIRM_DRAWDOWN) {
        top = { ...turn(open.peak), kind: 'provisional' };
        trough = open.trough;
      } else {
        return { ...base, athPending: turn(open.peak), status: 'MENUNGGU TOP' };
      }
    }
    if (!top || !trough) return { ...base, status: 'MENUNGGU TOP' };
    const rise = maxBetween(s, trough.day + 1, windowEnd) / trough.price - 1;
    const riseFromBottom = Number.isFinite(rise) ? rise : null;
    const bottomConfirmed = riseFromBottom !== null && riseFromBottom >= C.BOTTOM_CONFIRM_RISE;
    return {
      ...base,
      top,
      bottom: turn(trough),
      bottomConfirmed,
      riseFromBottom,
      status: !bottomConfirmed ? 'TOP SEMENTARA' : top.kind === 'final' ? 'SIKLUS SELESAI' : 'BOTTOM TERKONFIRMASI',
    };
  });
}

export interface Labeled {
  /** Cycle number, or `a→b` for a pair of consecutive cycles. */
  label: string;
  value: number;
}

export interface Durations {
  halvingToTop: Labeled[];
  topToBottom: Labeled[];
  topToTop: Labeled[];
  bottomToTop: Labeled[];
}

const daysBetween = (a: string, b: string) => toDay(b) - toDay(a);

/** Durations from tops (final or provisional) and confirmed bottoms only, as in the notebook. */
export function measure(cycles: readonly Cycle[]): Durations {
  const use = C.EXCLUDE_FIRST_CYCLE ? cycles.slice(1) : cycles;
  const inUse = new Set(use.map((c) => c.index));
  const pairs = cycles.slice(1).map((b, i) => [cycles[i], b] as const).filter(([a]) => inUse.has(a.index));
  const pairLabel = (a: Cycle, b: Cycle) => `${a.index}→${b.index}`;
  return {
    halvingToTop: use.filter((c) => c.top).map((c) => ({ label: String(c.index), value: daysBetween(c.halving, c.top!.date) })),
    topToBottom: use.filter((c) => c.bottomConfirmed).map((c) => ({ label: String(c.index), value: daysBetween(c.top!.date, c.bottom!.date) })),
    topToTop: pairs.filter(([a, b]) => a.top && b.top).map(([a, b]) => ({ label: pairLabel(a, b), value: daysBetween(a.top!.date, b.top!.date) })),
    bottomToTop: pairs
      .filter(([a, b]) => a.bottomConfirmed && b.top)
      .map(([a, b]) => ({ label: pairLabel(a, b), value: daysBetween(a.bottom!.date, b.top!.date) })),
  };
}

export interface Interval {
  n: number;
  mean: number;
  p80: [number, number];
}

export function interval(values: readonly number[]): Interval | null {
  const d = predictive(values, C.SCALE_INFLATE);
  return d ? { n: values.length, mean: d.loc, p80: [d.ppf(C.SHOWN_RANGE[0]), d.ppf(C.SHOWN_RANGE[1])] } : null;
}

/** A: previous top + top→top · B: halving + halving→top · C: previous bottom + bottom→top · BOTTOM: top + top→bottom · CHAIN: halving + halving→top + top→bottom. */
export type Method = 'A' | 'B' | 'C' | 'BOTTOM' | 'CHAIN';

export interface BacktestRow {
  target: 'top' | 'bottom';
  cycle: number;
  method: Method;
  n: number;
  guess: string;
  actual: string;
  /** Actual − guess, in whole days (floored, like pandas `Timedelta.days`). */
  missDays: number;
}

function row(target: BacktestRow['target'], cycle: number, method: Method, anchorDay: number, gap: number, n: number, actual: string): BacktestRow {
  const pred = anchorDay + gap;
  return { target, cycle, method, n, guess: isoDay(pred), actual, missDays: Math.floor(toDay(actual) - pred) };
}

/** Leave-earlier-out: each cycle's top/bottom guessed from the cycles before it only. */
export function backtest(cycles: readonly Cycle[]): BacktestRow[] {
  const withTop = cycles.filter((c) => c.top);
  const rows: BacktestRow[] = [];
  withTop.forEach((c, i) => {
    const prev = withTop.slice(0, i);
    if (prev.length === 0) return;
    const last = prev[prev.length - 1];
    const prevPairs = prev.slice(1).map((b, j) => [prev[j], b] as const);
    const t2t = prevPairs.map(([a, b]) => daysBetween(a.top!.date, b.top!.date));
    const h2t = prev.map((p) => daysBetween(p.halving, p.top!.date));
    const b2t = prevPairs.filter(([a]) => a.bottomConfirmed).map(([a, b]) => daysBetween(a.bottom!.date, b.top!.date));
    const t2b = prev.filter((p) => p.bottomConfirmed).map((p) => daysBetween(p.top!.date, p.bottom!.date));
    if (t2t.length) rows.push(row('top', c.index, 'A', toDay(last.top!.date), mean(t2t), t2t.length, c.top!.date));
    rows.push(row('top', c.index, 'B', toDay(c.halving), mean(h2t), h2t.length, c.top!.date));
    if (b2t.length) rows.push(row('top', c.index, 'C', toDay(last.bottom!.date), mean(b2t), b2t.length, c.top!.date));
    if (c.bottomConfirmed && t2b.length) {
      rows.push(row('bottom', c.index, 'BOTTOM', toDay(c.top!.date), mean(t2b), t2b.length, c.bottom!.date));
      rows.push(row('bottom', c.index, 'CHAIN', toDay(c.halving), mean(h2t) + mean(t2b), t2b.length, c.bottom!.date));
    }
  });
  return rows;
}

/** Round half to even, like pandas `.round(0)` (4.5 -> 4, 30.5 -> 30). */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Mean |miss| per method in whole days, or `null` when the method was never testable. */
export function avgMiss(rows: readonly BacktestRow[], method: Method): number | null {
  const r = rows.filter((x) => x.method === method);
  return r.length ? roundHalfEven(mean(r.map((x) => Math.abs(x.missDays)))) : null;
}

export type WindowFlag = 'LEWAT JENDELA PROYEKSI' | 'DI LUAR POLA HISTORIS — POLA SIKLUS MUNGKIN BERUBAH';

export interface DateWindow {
  center: string;
  p80: [string, string];
  /** Today is past the 80% (or the 95%) upper edge and the event is not confirmed. */
  flag: WindowFlag | null;
  method: Method;
  /** Past values the window rests on. */
  n: number;
  /** Backtest mean |miss| of this method, in days. */
  avgMissDays: number | null;
}

function flagFor(nowDay: number, hi80: number, hi95: number): WindowFlag | null {
  return nowDay > hi95 ? 'DI LUAR POLA HISTORIS — POLA SIKLUS MUNGKIN BERUBAH' : nowDay > hi80 ? 'LEWAT JENDELA PROYEKSI' : null;
}

function windowFrom(anchor: number, d: Predictive, nowDay: number, method: Method, bt: BacktestRow[]): DateWindow {
  const [lo, hi] = C.SHOWN_RANGE.map((p) => anchor + d.ppf(p));
  return {
    center: isoDay(anchor + d.loc),
    p80: [isoDay(lo), isoDay(hi)],
    flag: flagFor(nowDay, hi, anchor + d.ppf(C.OUTER_RANGE[1])),
    method,
    n: d.n,
    avgMissDays: avgMiss(bt, method),
  };
}

/** Standard Student-t draws: Z / √(χ²_df / df), χ² as a sum of squared normals (df is small). */
function tSampler(rand: () => number, df: number) {
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const u1 = Math.max(rand(), 1e-12);
    const r = Math.sqrt(-2 * Math.log(u1));
    const a = 2 * Math.PI * rand();
    spare = r * Math.sin(a);
    return r * Math.cos(a);
  };
  return () => {
    let chi = 0;
    for (let k = 0; k < df; k += 1) chi += normal() ** 2;
    return normal() / Math.sqrt(chi / df);
  };
}

/** anchor + X + Y with X, Y independent predictive t's: deterministic Monte Carlo (seeded). */
function chainWindow(anchor: number, a: Predictive, b: Predictive, nowDay: number, bt: BacktestRow[]): DateWindow {
  const rand = mulberry32(C.CHAIN_SEED);
  const ta = tSampler(rand, a.df);
  const tb = tSampler(rand, b.df);
  const sums = new Float64Array(C.CHAIN_SAMPLES);
  for (let i = 0; i < sums.length; i += 1) sums[i] = a.loc + a.scale * ta() + b.loc + b.scale * tb();
  sums.sort();
  const q = (p: number) => anchor + quantileSorted(sums as unknown as number[], p);
  return {
    center: isoDay(q(0.5)),
    p80: [isoDay(q(C.SHOWN_RANGE[0])), isoDay(q(C.SHOWN_RANGE[1]))],
    flag: flagFor(nowDay, q(C.SHOWN_RANGE[1]), q(C.OUTER_RANGE[1])),
    method: 'CHAIN',
    n: Math.min(a.n, b.n),
    avgMissDays: avgMiss(bt, 'CHAIN'),
  };
}

export interface Projection {
  /** What is projected: this cycle's top or bottom, or the next cycle's top. */
  key: 'top' | 'bottom' | 'nextTop';
  primary: DateWindow;
  /** Cross-check by a second method, when it can be computed. */
  cross: DateWindow | null;
}

export interface NextHalving {
  /** Block height of the next halving. */
  height: number;
  blocksLeft: number;
  center: string;
  range: [string, string];
  /** Minutes per block used: live epoch average, last halving epoch average, protocol target. */
  minutes: { live: number | null; lastEpoch: number | null; target: number; used: number };
  /** Exact day number (fractional) of the centre estimate. */
  day: number;
}

/** Next halving from the tip height: blocks left × minutes per block, from now. */
export function estimateNextHalving(
  halvings: readonly HalvingPoint[],
  blockHeight: number,
  liveMinutes: number | null,
  nowMs: number,
): NextHalving {
  const height = C.HALVING_INTERVAL * (halvings.length + 1);
  const left = height - blockHeight;
  const [a, b] = halvings.slice(-2);
  let lastEpoch: number | null = null;
  if (a && b) {
    const days = a.ts && b.ts ? (b.ts - a.ts) / 86_400 : toDay(b.date) - toDay(a.date);
    lastEpoch = (days * 1440) / C.HALVING_INTERVAL;
  }
  const used = liveMinutes ?? lastEpoch ?? C.TARGET_BLOCK_MINUTES;
  const all = [liveMinutes, lastEpoch, C.TARGET_BLOCK_MINUTES].filter((m): m is number => m !== null);
  const at = (m: number) => nowMs / DAY_MS + (left * m) / 1440;
  return {
    height,
    blocksLeft: left,
    center: isoDay(at(used)),
    range: [isoDay(at(Math.min(...all))), isoDay(at(Math.max(...all)))],
    minutes: { live: liveMinutes, lastEpoch, target: C.TARGET_BLOCK_MINUTES, used },
    day: at(used),
  };
}

export interface CycleAnalysis {
  cycles: Cycle[];
  /** The running cycle (last halving); `null` only without any halving. */
  current: Cycle | null;
  durations: Durations;
  intervals: { halvingToTop: Interval | null; topToBottom: Interval | null; topToTop: Interval | null; bottomToTop: Interval | null };
  /** Cycles with a final top and a confirmed bottom. */
  completed: number;
  projections: Projection[];
  nextHalving: NextHalving | null;
  backtest: BacktestRow[];
}

/**
 * Everything on the halving-cycle page. Price-based work uses the series' last
 * day; the halving countdown and the "past the window" flags use `nowMs`.
 */
export function analyzeCycles(
  s: DailySeries,
  opts: { halvings: readonly HalvingPoint[]; blockHeight: number | null; liveBlockMinutes: number | null; nowMs: number },
): CycleAnalysis {
  const cycles = findCycles(s, opts.halvings);
  const current = cycles[cycles.length - 1] ?? null;
  const durations = measure(cycles);
  const vals = (xs: Labeled[]) => xs.map((x) => x.value);
  const dH2t = predictive(vals(durations.halvingToTop), C.SCALE_INFLATE);
  const dT2b = predictive(vals(durations.topToBottom), C.SCALE_INFLATE);
  const dT2t = predictive(vals(durations.topToTop), C.SCALE_INFLATE);
  const dB2t = predictive(vals(durations.bottomToTop), C.SCALE_INFLATE);
  const bt = backtest(cycles);
  const nowDay = opts.nowMs / DAY_MS;
  const nextHalving =
    opts.blockHeight !== null ? estimateNextHalving(opts.halvings, opts.blockHeight, opts.liveBlockMinutes, opts.nowMs) : null;

  const projections: Projection[] = [];
  const push = (key: Projection['key'], primary: DateWindow | null, cross: DateWindow | null) => {
    if (primary || cross) projections.push({ key, primary: (primary ?? cross)!, cross: primary ? cross : null });
  };
  const prevTop = [...cycles.slice(0, -1)].reverse().find((c) => c.top)?.top ?? null;
  const nextTopFromHalving = dH2t && nextHalving ? windowFrom(nextHalving.day, dH2t, nowDay, 'B', bt) : null;

  if (current && current.status === 'MENUNGGU TOP') {
    const h = toDay(current.halving);
    push('top', dH2t ? windowFrom(h, dH2t, nowDay, 'B', bt) : null, dT2t && prevTop ? windowFrom(toDay(prevTop.date), dT2t, nowDay, 'A', bt) : null);
    push('bottom', dH2t && dT2b ? chainWindow(h, dH2t, dT2b, nowDay, bt) : null, null);
  } else if (current && current.status === 'TOP SEMENTARA') {
    const t = toDay(current.top!.date);
    push('bottom', dT2b ? windowFrom(t, dT2b, nowDay, 'BOTTOM', bt) : null, null);
    push('nextTop', nextTopFromHalving, dT2t ? windowFrom(t, dT2t, nowDay, 'A', bt) : null);
  } else if (current) {
    push('nextTop', nextTopFromHalving, dB2t ? windowFrom(toDay(current.bottom!.date), dB2t, nowDay, 'C', bt) : null);
  }

  return {
    cycles,
    current,
    durations,
    intervals: {
      halvingToTop: interval(vals(durations.halvingToTop)),
      topToBottom: interval(vals(durations.topToBottom)),
      topToTop: interval(vals(durations.topToTop)),
      bottomToTop: interval(vals(durations.bottomToTop)),
    },
    completed: cycles.filter((c) => c.status === 'SIKLUS SELESAI').length,
    projections,
    nextHalving,
    backtest: bt,
  };
}
