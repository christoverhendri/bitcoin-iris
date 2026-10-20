import type { CSSProperties, ReactNode } from 'react';
import { type Tone, toneVar } from '@/lib/theme/tokens';
import { softCase } from '@/lib/softCase';

/**
 * Bar fills: the accent for "up", a warm brown for "down", so the two differ
 * in lightness inside the one Ember colour family.
 */
function barFill(t: Tone): string {
  if (t === 'up') return 'var(--accent)';
  if (t === 'down') return '#8a5e40';
  return toneVar(t);
}

/** `Label ......... Value`: the snapshot / metric list row. */
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
      className="kv-row"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '11px 12px',
        margin: '0 14px',
      }}
    >
      <span className="t-label">{softCase(label)}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: toneVar(tone) }}>{value}</span>
        {sub ? (
          <span className="t-caption" style={{ display: 'block' }}>
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Small labelled figure used in the technical strips. */
export function StatTile({
  label,
  value,
  tone = 'txt',
  detail,
  inset,
}: {
  label: string;
  value: string;
  tone?: Tone;
  detail?: string;
  /** Darker, for use inside another card. */
  inset?: boolean;
}) {
  return (
    <div className={inset ? 'iris-inset' : 'iris-card'} style={{ padding: '14px 16px', minWidth: 0 }}>
      <div className="t-label">{softCase(label)}</div>
      <div
        className="t-title"
        style={{ fontSize: 22, color: toneVar(tone), marginTop: 6 }}
      >
        {value}
      </div>
      {detail ? (
        <div className="t-caption" style={{ marginTop: 3 }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/** Big KPI card with an optional progress bar. */
export function KpiCard({
  label,
  value,
  tone = 'txt',
  detail,
  pct,
  right,
  bare,
}: {
  label: string;
  value: string;
  tone?: Tone;
  detail?: string;
  /** 0-100. Omit to hide the bar. */
  pct?: number;
  right?: ReactNode;
  /** Render without its own card, for use inside another card. */
  bare?: boolean;
}) {
  return (
    <div className={bare ? undefined : 'iris-card'} style={{ padding: '18px 20px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="t-label">{softCase(label)}</span>
        {right}
      </div>
      <div
        className="t-display"
        style={{ fontSize: 32, color: toneVar(tone), marginTop: 10 }}
      >
        {value}
      </div>
      {detail ? (
        <div style={{ fontSize: 13, color: 'var(--mut)', marginTop: 6, lineHeight: 1.45 }}>{detail}</div>
      ) : null}
      {pct == null ? null : <ProgressBar pct={pct} tone={tone} style={{ marginTop: 14 }} />}
    </div>
  );
}

/** A rounded track with a soft fill. */
export function ProgressBar({
  pct,
  tone = 'up',
  height = 6,
  style,
}: {
  pct: number;
  tone?: Tone;
  height?: number;
  style?: CSSProperties;
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
        borderRadius: height,
        background: 'var(--line)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          borderRadius: height,
          background: barFill(tone === 'txt' ? 'mut' : tone),
        }}
      />
    </div>
  );
}

/**
 * A bar that grows left or right from a centre zero-line: monthly seasonality
 * averages, lag correlations, exchange netflow summaries.
 */
export function DivergingBar({
  value,
  max,
  tone,
  height = 8,
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
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: height,
        background: 'var(--line)',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          background: 'var(--stroke-strong)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          background: barFill(t),
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
      className="chip"
      style={{
        color: toneVar(tone),
        background: `color-mix(in srgb, ${toneVar(tone)} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${toneVar(tone)} 28%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {softCase(label)}
    </span>
  );
}
