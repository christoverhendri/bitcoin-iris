import type { ReactNode } from 'react';

/** Big number + caption, for the forward-validation summaries. */
export function Figure({ label, value, detail, color }: { label: string; value: string; detail?: ReactNode; color?: string }) {
  return (
    <div style={{ background: 'var(--panel)', padding: '10px 12px', minWidth: 0 }}>
      <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.14em', color: 'var(--mut)' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, marginTop: 4, color: color ?? 'var(--txt)' }}>{value}</div>
      {detail ? <div style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--dim)', marginTop: 2 }}>{detail}</div> : null}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, padding: '10px 12px 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>{children}</p>;
}

export const pct = (x: number | null, digits = 0) => (x === null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
