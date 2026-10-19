/**
 * Student-t distribution and the small-sample prediction interval used by the
 * halving-cycle page. Pure, no I/O.
 *
 * Why t and not normal: with n = 3 cycles the 95% multiplier is t(2) = 4.30,
 * not 1.96. The wide interval is the honest answer from three data points.
 *
 * Port of `scipy.stats.t` as used in research/BTC_Halving_Cycle_PowerLaw.ipynb
 * (`predictive()`): df = n − 1, loc = mean, scale = sd(ddof=1)·√(1 + 1/n).
 * Equivalent to the Bayesian posterior predictive under a non-informative prior.
 */

/** Lanczos approximation of ln Γ(x), x > 0 (g = 7, n = 9; ~1e-15 relative). */
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i += 1) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (Numerical Recipes `betacf`, modified Lentz). */
function betaCf(a: number, b: number, x: number): number {
  const EPS = 1e-15;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(a, b, x)) / a : 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

/** CDF of the standard Student-t with `df` degrees of freedom. */
export function tCdf(t: number, df: number): number {
  if (t === 0) return 0.5;
  const tail = 0.5 * incBeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Inverse CDF of the standard Student-t (bisection to machine precision). */
export function tPpf(p: number, df: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  if (p === 0.5) return 0;
  let lo = -1;
  let hi = 1;
  while (tCdf(lo, df) > p) lo *= 2;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Predictive {
  n: number;
  df: number;
  /** Centre: the sample mean (also the t median). */
  loc: number;
  scale: number;
  cdf: (x: number) => number;
  ppf: (p: number) => number;
}

export const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Sample standard deviation (ddof = 1). */
export function sd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Posterior-predictive t for one more draw like `xs`. `null` below two values —
 * a spread cannot be estimated from one.
 */
export function predictive(xs: readonly number[], scaleInflate = 1): Predictive | null {
  const n = xs.length;
  if (n < 2) return null;
  const df = n - 1;
  const loc = mean(xs);
  const scale = sd(xs) * Math.sqrt(1 + 1 / n) * scaleInflate;
  return {
    n,
    df,
    loc,
    scale,
    cdf: (x) => tCdf((x - loc) / scale, df),
    ppf: (p) => loc + scale * tPpf(p, df),
  };
}
