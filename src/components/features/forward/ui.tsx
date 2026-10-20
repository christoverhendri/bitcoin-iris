import type { ReactNode } from 'react';

/** Big number + caption, for the forward-validation summaries. */
export function Figure({ label, value, detail, color }: { label: string; value: string; detail?: ReactNode; color?: string }) {
  return (
    <div className="iris-inset" style={{ padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 13, color: 'var(--dim)' }}>{label.charAt(0) + label.slice(1).toLowerCase()}</div>
      <div className="t-title" style={{ fontSize: 26, marginTop: 6, color: color ?? 'var(--txt)' }}>
        {value}
      </div>
      {detail ? <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--dim)', marginTop: 6 }}>{detail}</div> : null}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p style={{ position: 'relative', zIndex: 4, margin: 0, padding: '4px 26px 4px', fontSize: 15, lineHeight: 1.55, color: '#e9ddd2' }}>
      {children}
    </p>
  );
}

export const pct = (x: number | null, digits = 0) => (x === null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);

export type Outcome = 'hit' | 'miss' | 'skip' | 'pending';

/** One square per published call: accent = right, brown = wrong, outline = waiting, faint = not counted. */
export function OutcomeSquares({ items, label }: { items: { key: string; outcome: Outcome; title: string }[]; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((it) => (
        <span
          key={it.key}
          title={it.title}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background:
              it.outcome === 'hit' ? 'var(--accent)' : it.outcome === 'miss' ? '#4a3426' : it.outcome === 'skip' ? '#2a2019' : 'transparent',
            boxShadow: it.outcome === 'pending' ? 'inset 0 0 0 2px #3a2b20' : undefined,
            transition: 'transform 250ms var(--ease)',
          }}
        />
      ))}
    </div>
  );
}

/** Hit / Miss / waiting pill at the end of a validation row. */
export function ResultTag({ outcome, hit = 'Hit', miss = 'Miss' }: { outcome: Outcome; hit?: string; miss?: string }) {
  const style =
    outcome === 'hit'
      ? { background: 'var(--accent-soft)', color: '#ffb27a' }
      : outcome === 'miss'
        ? { background: '#2a211b', color: '#e8d5c4' }
        : { background: '#1f1712', color: 'var(--dim)' };
  const text = outcome === 'hit' ? hit : outcome === 'miss' ? miss : outcome === 'skip' ? 'Kecil' : 'Menunggu';
  return (
    <span style={{ justifySelf: 'end', padding: '4px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', ...style }}>{text}</span>
  );
}

/** The big headline figure of a validation card, with its caption beside it. */
export function Headline({ value, caption }: { value: string; caption: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <span className="t-display" style={{ fontSize: 52 }}>
        {value}
      </span>
      <span style={{ fontSize: 15, color: 'var(--mut)' }}>{caption}</span>
    </div>
  );
}
