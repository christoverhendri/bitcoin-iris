import type { ReactNode } from 'react';
import { DataTable } from '@/components/primitives';

/** DataTable in the terminal's mono type (the table class sets no size of its own). */
export function QTable({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>
      <DataTable>{children}</DataTable>
    </div>
  );
}

/** `METODOLOGI` chip; the note (built from `src/lib/quant/config.ts`) shows on hover. */
export function MethodTag({ note }: { note: string }) {
  return (
    <span
      title={note}
      className="iris-micro"
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: 'var(--mut)',
        border: '1px dashed var(--line2)',
        padding: '3px 8px',
        cursor: 'help',
        whiteSpace: 'nowrap',
      }}
    >
      METODOLOGI
    </span>
  );
}

/** The 1–2 sentence plain-language note under a panel header. */
export function Explain({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, padding: '10px 12px 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>{children}</p>;
}

/** Day number -> epoch ms. */
export const dayMs = (day: number) => day * 86_400_000;

/** Log-scale mapper from price to y. */
export function logScale(lo: number, hi: number, yTop: number, yBottom: number) {
  const l0 = Math.log10(lo);
  const l1 = Math.log10(hi);
  return (p: number) => yBottom - ((Math.log10(p) - l0) / (l1 - l0)) * (yBottom - yTop);
}

/** $1, $10, $100 … within [lo, hi]. */
export function decadeTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo)); 10 ** e <= hi; e += 1) out.push(10 ** e);
  return out;
}

export function tickUsd(p: number): string {
  return p >= 1e6 ? `$${p / 1e6}M` : p >= 1e3 ? `$${p / 1e3}K` : `$${p}`;
}

/** 1 January of every `step`-th year in [d0, d1] (day numbers). */
export function yearTicks(d0: number, d1: number, step = 2): { day: number; year: number }[] {
  const out: { day: number; year: number }[] = [];
  const y0 = new Date(dayMs(d0)).getUTCFullYear();
  const y1 = new Date(dayMs(d1)).getUTCFullYear();
  for (let y = y0; y <= y1; y += 1) {
    const day = Date.UTC(y, 0, 1) / 86_400_000;
    if (day >= d0 && day <= d1 && y % step === 0) out.push({ day, year: y });
  }
  return out;
}

export const microText = {
  fontFamily: 'var(--mono)',
  fontSize: 8,
  letterSpacing: '0.1em',
} as const;
