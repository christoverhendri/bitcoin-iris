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
  forecast: 'Forecast',
  quant: 'Quant',
  chain: 'On-chain',
  macro: 'Macro',
  sentiment: 'Sentiment',
};
const NAV_ORDER = ['overview', 'forecast', 'quant', 'chain', 'macro', 'sentiment'];

/**
 * The Ember top bar: the IRIS mark, one pill row for every section, the
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
        <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden="true">
          <circle cx={15} cy={15} r={12} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
          <circle cx={15} cy={15} r={4.5} fill="var(--accent)" />
        </svg>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>IRIS</span>
        <span style={{ fontSize: 14, color: 'var(--dim)' }}>BTC Terminal</span>
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
