import type { ReactNode } from 'react';
import { type Tone, toneVar } from '@/lib/theme/tokens';

/** `LABEL ......... VALUE` — the snapshot / metric list row. */
export function KeyValueRow({
  label,
  value,
  tone = 'txt',
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  /** Small trailing detail under the value (e.g. `+1.2% 24h`). */
  sub?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 10,
        padding: '7px 12px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <span
        className="iris-micro"
        style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)', letterSpacing: '.06em' }}
      >
        {label}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: toneVar(tone) }}
        >
          {value}
        </span>
        {sub ? (
          <span
            className="iris-micro"
            style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--dim)' }}
          >
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Small labelled figure used in the 5-tile technical strips. */
export function StatTile({
  label,
  value,
  tone = 'txt',
  detail,
}: {
  label: string;
  value: string;
  tone?: Tone;
  detail?: string;
}) {
  return (
    <div style={{ background: 'var(--panel)', padding: '11px 14px', minWidth: 0 }}>
      <div
        className="iris-micro"
        style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontWeight: 700,
          fontSize: 16,
          color: toneVar(tone),
          marginTop: 5,
        }}
      >
        {value}
      </div>
      {detail ? (
        <div
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', marginTop: 2 }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/** Big KPI card with a progress bar — the four cards on Overview. */
export function KpiCard({
  label,
  value,
  tone = 'txt',
  detail,
  pct,
  right,
}: {
  label: string;
  value: string;
  tone?: Tone;
  detail?: string;
  /** 0-100. Omit to hide the bar. */
  pct?: number;
  right?: ReactNode;
}) {
  return (
    <div style={{ background: 'var(--panel)', padding: '11px 14px', minWidth: 0 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <span
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
        >
          {label}
        </span>
        {right}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 800,
          fontSize: 22,
          color: toneVar(tone),
          marginTop: 6,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {detail ? (
        <div
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)', marginTop: 2 }}
        >
          {detail}
        </div>
      ) : null}
      {pct == null ? null : <ProgressBar pct={pct} tone={tone} style={{ marginTop: 9 }} />}
    </div>
  );
}

/** 4px sunk track, 2px fill, no radius. */
export function ProgressBar({
  pct,
  tone = 'up',
  height = 4,
  style,
}: {
  pct: number;
  tone?: Tone;
  height?: number;
  style?: React.CSSProperties;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        height,
        background: 'var(--sunk)',
        border: '1px solid var(--line2)',
        ...style,
      }}
    >
      <div style={{ height: height - 2, width: `${clamped}%`, background: toneVar(tone) }} />
    </div>
  );
}

/**
 * A bar that grows left or right from a centre zero-line — monthly seasonality
 * averages, lag correlations, exchange netflow summaries.
 */
export function DivergingBar({
  value,
  max,
  tone,
  height = 6,
}: {
  value: number;
  /** Absolute value that fills half the track. */
  max: number;
  tone?: Tone;
  height?: number;
}) {
  const frac = Math.min(1, Math.abs(value) / (max || 1));
  const half = frac * 50;
  const t: Tone = tone ?? (value >= 0 ? 'up' : 'down');
  return (
    <div style={{ position: 'relative', height, background: 'var(--sunk)', border: '1px solid var(--line2)' }}>
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          background: 'var(--line2)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          background: toneVar(t),
          ...(value >= 0
            ? { left: '50%', width: `${half}%` }
            : { right: '50%', width: `${half}%` }),
        }}
      />
    </div>
  );
}

/** BULL / BEAR / NEUTRAL style chip. Never wraps. */
export function Tag({ label, tone = 'mut' }: { label: string; tone?: Tone }) {
  return (
    <span
      className="iris-micro"
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: toneVar(tone),
        border: `1px solid color-mix(in srgb, ${toneVar(tone)} 40%, transparent)`,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}
