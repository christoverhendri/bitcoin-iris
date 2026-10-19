/**
 * Display words, number formats and the methodology note for the Quant pages.
 * Pure (no server imports). Every threshold in the text is read from
 * `src/lib/quant/config.ts`, so the note cannot drift from the code.
 */
import * as C from '@/lib/quant/config';
import type { CycleStatus, Method, Projection } from '@/lib/quant/cycle';
import type { Zone } from '@/lib/quant/powerLaw';
import type { Tone } from '@/lib/theme/tokens';

/** `$124,824` (whole dollars); `$5.27` below $100, where cents still matter. */
export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Ratio -> `+50%` / `−23%` (0.5 -> +50%). */
export function signedPct(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const v = ratio * 100;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;
}

export const fmtDays = (d: number) => `${Math.round(d).toLocaleString('en-US')} hari`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const STATUS_TONE: Record<CycleStatus, Tone> = {
  'MENUNGGU TOP': 'amber',
  'TOP SEMENTARA': 'down',
  'BOTTOM TERKONFIRMASI': 'up',
  'SIKLUS SELESAI': 'blue',
};

export const PROJECTION_LABEL: Record<Projection['key'], string> = {
  top: 'PERKIRAAN TOP SIKLUS INI',
  bottom: 'PERKIRAAN BOTTOM SIKLUS INI',
  nextTop: 'PERKIRAAN TOP SIKLUS BERIKUTNYA',
};

export const METHOD_WORDS: Record<Method, string> = {
  A: 'top sebelumnya + jarak top→top',
  B: 'halving + jeda halving→top',
  C: 'bottom + jarak bottom→top',
  BOTTOM: 'top + jarak top→bottom',
  CHAIN: 'halving + jeda halving→top + jarak top→bottom',
};

/** Methodology note (hover), built from the config. */
export const CYCLE_METHOD_NOTE = [
  `Top final: puncak tertinggi yang diikuti turun ≥${pct(C.MAJOR_TOP_DRAWDOWN)} lalu ditembus lagi.`,
  `Top sementara: puncak tertinggi siklus berjalan setelah harga turun ≥${pct(C.TOP_CONFIRM_DRAWDOWN)} darinya.`,
  `Bottom: close terendah setelah top; terkonfirmasi setelah naik ≥+${pct(C.BOTTOM_CONFIRM_RISE)} tanpa close lebih rendah.`,
  `Rentang: distribusi t (df = n−1, skala = sd·√(1+1/n)), ditampilkan ${pct(C.SHOWN_RANGE[1] - C.SHOWN_RANGE[0])}.`,
  `Halving: timestamp blok setiap ${C.HALVING_INTERVAL.toLocaleString('en-US')} blok; estimasi = sisa blok × menit per blok.`,
  'Semua dihitung ulang dari harga harian Coin Metrics setiap halaman diperbarui.',
].join('\n');

export const CORRIDOR_METHOD_NOTE = [
  'log10(harga) = a + b·log10(hari sejak genesis), di-fit ulang tiap awal bulan hanya dengan data sebelumnya.',
  'Persentil = bagian selisih (harga − garis) masa lalu yang ≤ selisih hari ini.',
  `Pita: kuantil ${C.QUANTS.map((q) => `P${Math.round(q * 100)}`).join(' / ')} selisih itu, dari fit terbaru.`,
  `Zona: batas persentil ${C.ZONE_EDGES.join(' / ')}.`,
].join('\n');

export const ZONE_COLOR: Record<Zone, string> = {
  'Sangat murah': 'var(--up)',
  Murah: 'color-mix(in srgb, var(--up) 60%, var(--mut))',
  Wajar: 'var(--blue)',
  Mahal: 'var(--amber)',
  'Sangat mahal': 'var(--down)',
};

/** `0–10`, `10–30` … from the config edges. */
export function zoneRange(i: number): string {
  const e = [0, ...C.ZONE_EDGES, 100];
  return `${e[i]}–${e[i + 1]}`;
}

/** Band names for the corridor quantiles. */
export const BAND_LABEL = C.QUANTS.map((q) => (q === 0.5 ? 'P50 (TENGAH)' : `P${Math.round(q * 100)}`));
