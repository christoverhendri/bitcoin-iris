import { describe, expect, it } from 'vitest';
import { zWords, zWordsShort } from './zWords';

describe('zWords', () => {
  it.each([
    [2.4, 'jauh di atas biasanya (2 tahun)'],
    [1.2, 'di atas biasanya (2 tahun)'],
    [0.3, 'sekitar biasanya (2 tahun)'],
    [-0.99, 'sekitar biasanya (2 tahun)'],
    [-1.5, 'di bawah biasanya (2 tahun)'],
    [-2, 'jauh di bawah biasanya (2 tahun)'],
    [null, 'belum ada pembanding'],
  ])('z = %s', (z, want) => {
    expect(zWords(z, '2 tahun')).toBe(want);
  });

  it('has a short form on the same scale', () => {
    expect(zWordsShort(1)).toBe('DI ATAS BIASANYA');
    expect(zWordsShort(undefined)).toBe('—');
  });
});
