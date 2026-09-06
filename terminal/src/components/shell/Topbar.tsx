'use client';

import { usePathname } from 'next/navigation';
import { sectionFromPath } from '@/lib/nav';
import { useDrawer } from './AppShell';
import { Clock } from './Clock';
import { LiveBadge } from './LiveBadge';
import { fmtPct, fmtUsd } from '@/lib/format';
import { signTone, toneVar } from '@/lib/theme/tokens';

export interface TickerState {
  symbol: string;
  price: number | null;
  changePct: number | null;
  stale: boolean;
}

export function Topbar({ ticker }: { ticker: TickerState }) {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const { open, setOpen } = useDrawer();

  return (
    <header
      style={{
        background: 'var(--sunk)',
        borderBottom: '2px solid var(--amber)',
        padding: '7px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {/* Drawer toggle. Hidden at >=1024px where the rail is always visible. */}
        <button
          className="iris-drawer-toggle nav-btn"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ padding: 6, border: '1px solid var(--line2)', color: 'var(--mut)' }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '.02em',
              color: 'var(--amber)',
            }}
          >
            BTC <span style={{ color: 'var(--mut)', fontWeight: 400 }}>/</span> {section?.title ?? 'IRIS'}
          </div>
          <div
            className="iris-micro"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.06em',
              color: 'var(--mut)',
              marginTop: 2,
            }}
          >
            {section?.blurb ?? ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.02em', color: 'var(--amber)' }}
        >
          {ticker.symbol}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--txt)' }}>
          {fmtUsd(ticker.price)}
        </span>
        <span
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            fontWeight: 700,
            color: toneVar(signTone(ticker.changePct ?? 0)),
          }}
        >
          {fmtPct(ticker.changePct)}
        </span>
        <LiveBadge stale={ticker.stale} />
        <Clock />
      </div>
    </header>
  );
}
