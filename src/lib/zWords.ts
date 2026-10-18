/**
 * A z-score in words, so no panel has to show "σ" (curation 2026-10-18: sigma
 * numbers were not reader-friendly). The cut points are the conventional 1 and
 * 2 standard deviations — a reading convention, not a fitted threshold.
 *
 * `window` names what the value is compared with, e.g. "2 tahun terakhir".
 */
export function zWords(z: number | null | undefined, window: string): string {
  if (z == null || !Number.isFinite(z)) return 'belum ada pembanding';
  if (z >= 2) return `jauh di atas biasanya (${window})`;
  if (z >= 1) return `di atas biasanya (${window})`;
  if (z > -1) return `sekitar biasanya (${window})`;
  if (z > -2) return `di bawah biasanya (${window})`;
  return `jauh di bawah biasanya (${window})`;
}

/** Short form for tight tiles: the same scale without the window. */
export function zWordsShort(z: number | null | undefined): string {
  if (z == null || !Number.isFinite(z)) return '—';
  if (z >= 2) return 'JAUH DI ATAS BIASANYA';
  if (z >= 1) return 'DI ATAS BIASANYA';
  if (z > -1) return 'SEKITAR BIASANYA';
  if (z > -2) return 'DI BAWAH BIASANYA';
  return 'JAUH DI BAWAH BIASANYA';
}
