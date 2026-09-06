/**
 * Deterministic pseudo-randomness for the mock layer.
 *
 * Mocks must be stable for a given day: the server renders them during SSR and
 * the browser renders them again during hydration. `Math.random()` there would
 * produce a hydration mismatch on every panel. Seeding from the UTC date means
 * both sides agree, and the numbers still drift day to day so the terminal does
 * not look frozen.
 */

/** Small, fast, well-distributed 32-bit PRNG. Returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string — cheap, stable, no dependencies. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Today in UTC as `YYYY-MM-DD`. The mock layer's unit of stability. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Seed combining a caller-supplied key with the current UTC day. */
export function dateSeed(key: string, now?: Date): number {
  return hashString(`${key}|${utcDay(now)}`);
}

/** Convenience: a seeded generator for one mock function. */
export function seeded(key: string, now?: Date): () => number {
  return mulberry32(dateSeed(key, now));
}

/** Uniform value in [min, max). */
export const between = (r: () => number, min: number, max: number) => min + r() * (max - min);

/** Random integer in [min, max]. */
export const intBetween = (r: () => number, min: number, max: number) =>
  Math.floor(between(r, min, max + 1));

/** Pick one element deterministically. */
export const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/**
 * A random walk producing a plausible-looking price series.
 * Used by several mocks; keeping it here stops each one inventing its own.
 */
export function walk(
  r: () => number,
  start: number,
  steps: number,
  volPct: number,
  driftPct = 0,
): number[] {
  const out: number[] = [start];
  for (let i = 1; i < steps; i++) {
    const shock = (r() - 0.5) * 2 * volPct;
    out.push(Math.max(1, out[i - 1] * (1 + (driftPct + shock) / 100)));
  }
  return out;
}
