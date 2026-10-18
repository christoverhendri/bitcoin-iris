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
  /** Why `stale` is set — shown as the badge tooltip. */
  staleReason?: string;
}

export function Topbar({ ticker }: { ticker: TickerState }) {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const { open, setOpen } = useDrawer();

  return (
    <header
      style={{
        background: 'var(--sunk)',
        borderBottom: '1px solid var(--line)',
        padding: '9px 16px',
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
              fontSize: 15,
              letterSpacing: '.1em',
              color: 'var(--txt)',
            }}
          >
            {section?.title ?? 'IRIS'}
          </div>
          <div
            className="iris-micro"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.06em',
              color: 'var(--dim)',
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
          style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--dim)' }}
        >
          {ticker.symbol}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
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
        <LiveBadge stale={ticker.stale} reason={ticker.staleReason} />
        <Clock />
      </div>
    </header>
  );
}
