import { type Envelope, explainMock } from '@/lib/envelope';
import { fmtAgo } from '@/lib/format';

/**
 * Renders only when the envelope carries synthetic data. This is the visible
 * half of the mock contract — if a panel shows placeholder numbers, this badge
 * is on it, because both come from the same `isMock` flag.
 */
export function MockBadge<T>({ env }: { env: Envelope<T> }) {
  if (!env.isMock) return null;
  return (
    <span
      className="iris-micro"
      title={explainMock(env)}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: 'var(--amber)',
        border: '1px solid var(--line2)',
        padding: '2px 6px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      MOCK
    </span>
  );
}

/**
 * A label for a panel whose data is a deliberate approximation of something the
 * product claims — currently exchange netflow standing in for hot/cold wallet
 * split, which needs a paid address-clustering provider.
 */
export function ProxyBadge({ title }: { title: string }) {
  return (
    <span
      className="iris-micro"
      title={title}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: 'var(--blue)',
        border: '1px solid var(--line2)',
        padding: '2px 6px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      PROXY
    </span>
  );
}

/** `RULE-BASED PLACEHOLDER` next to a confidence bar, until a real model ships. */
export function PlaceholderBadge() {
  return (
    <span
      className="iris-micro"
      title="This classification comes from a hand-written rule, not a trained model."
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: 'var(--amber)',
        border: '1px solid var(--line2)',
        padding: '2px 6px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      RULE-BASED PLACEHOLDER
    </span>
  );
}

/** `SOURCE: coinbase · 2m ago` footnote pinned to the bottom of a panel. */
export function SourceFootnote<T>({ env, now }: { env: Envelope<T>; now?: number }) {
  return (
    <div
      className="iris-micro"
      style={{
        marginTop: 'auto',
        padding: '7px 12px',
        borderTop: '1px solid var(--line)',
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.12em',
        color: 'var(--dim)',
      }}
    >
      SOURCE: {env.sourceKey.toUpperCase().replace(/_/g, ' ')}
      {' · '}
      {env.isMock ? 'PLACEHOLDER' : fmtAgo(env.asOf, now)}
    </div>
  );
}
