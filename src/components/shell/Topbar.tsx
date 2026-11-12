'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, sectionHref } from '@/lib/nav';
import { Clock } from './Clock';
import { LiveBadge } from './LiveBadge';
import { fmtPct, fmtUsd } from '@/lib/format';
import { signTone, toneVar } from '@/lib/theme/tokens';

export interface TickerState {
  symbol: string;
  price: number | null;
  changePct: number | null;
  stale: boolean;
  /** Why `stale` is set — shown as the badge tooltip. */
  staleReason?: string;
}

/** Short names for the pill navigation; the full name stays the page title. */
const NAV_LABEL: Record<string, string> = {
  overview: 'Overview',
  strategy: 'Strategy',
  forecast: 'Forecast',
  quant: 'Quant',
  chain: 'On-chain',
  macro: 'Macro',
  sentiment: 'Sentiment',
};
const NAV_ORDER = ['overview', 'forecast', 'quant', 'chain', 'macro', 'sentiment', 'strategy'];

/**
 * The Ember top bar: the BitPulse mark, one pill row for every section, the
 * live price, the UTC clock and the LIVE dot. It replaces the side rail, so
 * the content gets the full width.
 */
export function Topbar({ ticker }: { ticker: TickerState }) {
  const pathname = usePathname();
  const activeKey = pathname.split('/').filter(Boolean)[0];
  const sections = NAV_ORDER.map((k) => SECTIONS.find((s) => s.key === k)).filter(
    (s): s is (typeof SECTIONS)[number] => Boolean(s),
  );
  const tone = toneVar(signTone(ticker.changePct ?? 0));

  return (
    <header
      className="rise"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '22px 0 12px',
      }}
    >
      <Link href="/overview" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--txt)' }}>
        <svg width={34} height={34} viewBox="0 0 34 34" aria-hidden="true">
          <defs>
            <linearGradient id="bp-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff8a3d" />
              <stop offset="1" stopColor="#e8480c" />
            </linearGradient>
          </defs>
          <rect width={34} height={34} rx={10} fill="url(#bp-mark)" />
          <path
            d="M5 18h6l3-8 5 15 3-9 2 2h5"
            fill="none"
            stroke="#fff6ee"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.03em' }}>
          Bit<span style={{ color: 'var(--accent)', fontWeight: 700 }}>Pulse</span>
        </span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--dim)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            paddingLeft: 12,
            borderLeft: '1px solid var(--stroke-strong)',
          }}
        >
          BTC Intelligence
        </span>
      </Link>

      <nav aria-label="Sections" className="ember-nav">
        {sections.map((s) => (
          <Link key={s.key} href={sectionHref(s)} aria-current={s.key === activeKey ? 'page' : undefined}>
            {NAV_LABEL[s.key] ?? s.label}
          </Link>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }} title={ticker.symbol}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {ticker.price == null ? '—' : `$${fmtUsd(ticker.price)}`}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: tone }}>{fmtPct(ticker.changePct)}</span>
        </span>
        <Clock />
        <LiveBadge stale={ticker.stale} reason={ticker.staleReason} />
      </div>
    </header>
  );
}
