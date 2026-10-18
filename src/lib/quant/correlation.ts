/**
 * Correlation and standardisation helpers.
 *
 * The subtle hazard these exist to contain: BTC trades 365 days a year and
 * equities trade about 252. Zipping two close arrays by index therefore pairs a
 * Tuesday with a Saturday somewhere in the first month and every number after
 * that is meaningless — while still being finite, plausible, and completely
 * wrong. `alignByDate` is the fix, and it is why callers should never index two
 * series against each other directly.
 */

/** Population standard deviation. `null` when the series is degenerate. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
  if (!Number.isFinite(variance) || variance <= 0) return null;
  return Math.sqrt(variance);
}

/**
 * Pearson correlation over two equal-length series.
 *
 * Returns `null` rather than a number when either side has no variance — a flat
 * series has no correlation with anything, and returning 0 would read as
 * "measured, and unrelated" instead of "not measurable".
 */
export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da <= 0 || db <= 0) return null;

  const r = num / Math.sqrt(da * db);
  if (!Number.isFinite(r)) return null;
  // Guard the float edge where |r| creeps a hair past 1.
  return Math.max(-1, Math.min(1, r));
}

/** How far the last value sits from its own history, in standard deviations. */
export function zScore(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const sd = stdev(xs);
  if (sd === null) return null;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const z = (xs[xs.length - 1] - mean) / sd;
  return Number.isFinite(z) ? z : null;
}

/** Simple period-over-period returns. Length is `closes.length - 1`. */
export function returns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    if (!(prev > 0)) continue;
    out.push(closes[i] / prev - 1);
  }
  return out;
}

export interface DatedPoint {
  /** Millisecond epoch. Only the UTC calendar day is used for matching. */
  ts: number;
  close: number;
}

const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/**
 * Pair two dated series on the UTC days they share, oldest first.
 *
 * Sessions present in only one series are dropped on both sides, so the result
 * is always two arrays of equal length describing the same calendar days.
 */
export function alignByDate(
  a: DatedPoint[],
  b: DatedPoint[],
): { dates: string[]; a: number[]; b: number[] } {
  const mapB = new Map<string, number>();
  for (const p of b) mapB.set(dayKey(p.ts), p.close);

  const dates: string[] = [];
  const xa: number[] = [];
  const xb: number[] = [];

  const seen = new Set<string>();
  for (const p of [...a].sort((x, y) => x.ts - y.ts)) {
    const k = dayKey(p.ts);
    if (seen.has(k)) continue; // one row per calendar day
    const other = mapB.get(k);
    if (other === undefined) continue;
    seen.add(k);
    dates.push(k);
    xa.push(p.close);
    xb.push(other);
  }

  return { dates, a: xa, b: xb };
}

/**
 * Correlation of the last `window` daily returns of two dated series.
 *
 * Returns `null` when fewer than `window` overlapping sessions survive
 * alignment. A correlation computed over eleven points is not a 30-day
 * correlation, and reporting one as if it were is the kind of quiet lie this
 * codebase refuses elsewhere.
 */
export function correlateDaily(
  a: DatedPoint[],
  b: DatedPoint[],
  window = 30,
): { r: number | null; sessions: number } {
  const aligned = alignByDate(a, b);
  const ra = returns(aligned.a);
  const rb = returns(aligned.b);
  const n = Math.min(ra.length, rb.length);
  if (n < window) return { r: null, sessions: n };
  return { r: pearson(ra.slice(-window), rb.slice(-window)), sessions: n };
}

/**
 * Rolling correlation of daily returns, one point per day, oldest first. Each
 * point is the Pearson r of the `window` returns ending on that date (matched
 * by UTC day, as `correlateDaily`). Days where either side was flat are skipped
 * rather than drawn as 0.
 */
export function rollingCorrelation(
  a: DatedPoint[],
  b: DatedPoint[],
  window = 30,
): { ts: number; r: number }[] {
  const aligned = alignByDate(a, b);
  const ra = returns(aligned.a);
  const rb = returns(aligned.b);
  const out: { ts: number; r: number }[] = [];
  // Return j runs from dates[j] to dates[j + 1].
  for (let end = window; end <= ra.length; end += 1) {
    const r = pearson(ra.slice(end - window, end), rb.slice(end - window, end));
    if (r !== null) out.push({ ts: Date.parse(`${aligned.dates[end]}T00:00:00Z`), r });
  }
  return out;
}
