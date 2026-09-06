import { describe, expect, it } from 'vitest';
import { bucketFeeHistogram } from './mempool';

/**
 * The histogram bucketer is the only piece of this source with logic worth
 * pinning: everything else is a field rename with a finite-number guard.
 */
describe('bucketFeeHistogram', () => {
  const byLabel = (buckets: ReturnType<typeof bucketFeeHistogram>) =>
    Object.fromEntries(buckets.map((b) => [b.label, b.vsize]));

  it('returns every band even when the histogram is empty', () => {
    // A chart with disappearing bars is unreadable — the bands are fixed.
    const b = bucketFeeHistogram([]);
    expect(b.map((x) => x.label)).toEqual(['<2', '2-4', '4-8', '8-15', '15-30', '30-60', '60+']);
    expect(b.every((x) => x.vsize === 0)).toBe(true);
  });

  it('places rates on the correct side of a band boundary', () => {
    // Bands are [from, to) — 2 belongs to '2-4', not '<2'.
    expect(byLabel(bucketFeeHistogram([[1.9, 100]]))['<2']).toBe(100);
    expect(byLabel(bucketFeeHistogram([[2, 100]]))['2-4']).toBe(100);
    expect(byLabel(bucketFeeHistogram([[3.99, 100]]))['2-4']).toBe(100);
    expect(byLabel(bucketFeeHistogram([[4, 100]]))['4-8']).toBe(100);
  });

  it('accumulates several entries into one band', () => {
    expect(byLabel(bucketFeeHistogram([[5, 100], [6, 250], [7.5, 50]]))['4-8']).toBe(400);
  });

  it('sends anything above the top boundary to the open-ended band', () => {
    expect(byLabel(bucketFeeHistogram([[60, 10], [1000, 5]]))['60+']).toBe(15);
  });

  it('drops entries it cannot use instead of guessing', () => {
    const b = byLabel(
      bucketFeeHistogram([
        [-1, 999], // negative rate: fits no band
        [5, 0], // zero weight
        [5, -20], // negative weight
        ['x', 100], // unparseable rate
        [5], // malformed pair
        'nonsense',
      ]),
    );
    expect(Object.values(b).every((v) => v === 0)).toBe(true);
  });

  it('tolerates a non-array payload', () => {
    // An upstream shape change must degrade to empty bands, not throw inside a
    // render.
    expect(bucketFeeHistogram(undefined).every((b) => b.vsize === 0)).toBe(true);
    expect(bucketFeeHistogram({ nope: true }).every((b) => b.vsize === 0)).toBe(true);
  });

  it('preserves total weight across bands', () => {
    const entries: [number, number][] = [[1, 10], [3, 20], [9, 30], [45, 40], [90, 50]];
    const total = bucketFeeHistogram(entries).reduce((s, b) => s + b.vsize, 0);
    expect(total).toBe(150);
  });
});
