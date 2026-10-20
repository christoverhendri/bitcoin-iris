import type { CSSProperties } from 'react';
import { type Envelope, explainMock, explainStale, fmtAgeShort } from '@/lib/envelope';
import { fmtAgo } from '@/lib/format';

/** One small pill shared by every status badge, tinted by `color`. */
function badgeStyle(color: string): CSSProperties {
  return {
    color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    whiteSpace: 'nowrap',
  };
}

/**
 * Renders only when the envelope carries synthetic data. This is the visible
 * half of the mock contract: if a panel shows placeholder numbers, this badge
 * is on it, because both come from the same `isMock` flag.
 *
 * Real but out-of-date data renders the STALE badge instead (same slot, so every
 * panel that already shows MockBadge gets it for free).
 */
export function MockBadge<T>({ env }: { env: Envelope<T> }) {
  if (!env.isMock) return env.isStale ? <StaleBadge ageSec={env.ageSec} title={explainStale(env)} /> : null;
  return (
    <span className="chip" title={explainMock(env)} style={badgeStyle('var(--amber)')}>
      Mock
    </span>
  );
}

/**
 * `Stale · 32h`: the data is genuine but older than the panel allows. Red rather
 * than MOCK's amber: a stale number that looks current is the more dangerous of
 * the two. Also used directly by panels that track a sub-part's age (e.g. DVOL).
 */
export function StaleBadge({ ageSec, title }: { ageSec: number | null; title?: string }) {
  return (
    <span
      className="chip"
      title={title ?? 'Real data, but older than this panel allows.'}
      style={badgeStyle('var(--down)')}
    >
      Stale · {fmtAgeShort(ageSec)}
    </span>
  );
}

/**
 * A label for a panel whose data is a deliberate approximation of something the
 * product claims: currently exchange netflow standing in for hot/cold wallet
 * split, which needs a paid address-clustering provider.
 */
export function ProxyBadge({ title }: { title: string }) {
  return (
    <span className="chip" title={title} style={badgeStyle('var(--blue)')}>
      Proxy
    </span>
  );
}

/** `Rule-based placeholder` next to a confidence bar, until a real model ships. */
export function PlaceholderBadge() {
  return (
    <span
      className="chip"
      title="This classification comes from a hand-written rule, not a trained model."
      style={badgeStyle('var(--amber)')}
    >
      Rule-based placeholder
    </span>
  );
}

/** `coinbase · 2m ago`, a quiet footnote pinned to the bottom of a panel. */
export function SourceFootnote<T>({ env, now }: { env: Envelope<T>; now?: number }) {
  return (
    <div className="t-caption" style={{ marginTop: 'auto', padding: '10px 20px 14px', opacity: 0.75 }}>
      {env.sourceKey.replace(/_/g, ' ')}
      {' · '}
      {env.isMock ? 'placeholder' : fmtAgo(env.asOf, now)}
      {!env.isMock && env.isStale && <span style={{ color: 'var(--down)' }}> · stale</span>}
    </div>
  );
}
