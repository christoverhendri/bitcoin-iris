"use client";

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, sectionFromPath, sectionHref } from '@/lib/nav';
import { Clock } from './Clock';
import { LiveBadge } from './LiveBadge';
import { CommandPalette } from './CommandPalette';
import { fmtPct, fmtUsd } from '@/lib/format';

export interface TickerState {
  symbol: string; price: number | null; changePct: number | null; stale: boolean;
}

export function Topbar({ ticker }: { ticker: TickerState }) {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  return <>
    <header className="terminal-topnav">
      <Link href="/overview" className="terminal-brand" aria-label="IRIS BTC overview">
        <Image src="/brand/btc-iris.svg" alt="" width={34} height={46} unoptimized />
        <span><strong>IRIS BTC</strong><small>INTELLIGENCE TERMINAL</small></span>
      </Link>
      <nav className="terminal-primary-nav" aria-label="Sections">
        {SECTIONS.map((s) => <Link key={s.key} href={sectionHref(s)} prefetch={false} aria-current={section?.key === s.key ? 'page' : undefined}>
          {s.key === 'sentiment' ? 'Sentiment' : s.label}
        </Link>)}
      </nav>
      <CommandPalette compact />
      <div className="terminal-header-status"><LiveBadge stale={ticker.stale} /><Clock /></div>
    </header>
    <div className="terminal-section-intro">
      <div><h1><span>BTC</span> / {section?.title ?? 'OVERVIEW'}</h1><p>{section?.key === 'overview' ? 'Signals. Evidence. A Clearer Picture.' : section?.blurb}</p></div>
      <div className="terminal-intro-quote">More signal. Less noise.<br />A deeper understanding of Bitcoin.</div>
      <div className="terminal-intro-art" aria-hidden="true" />
      <div className="terminal-intro-ticker"><span>{ticker.symbol}</span><strong>{fmtUsd(ticker.price)}</strong><small style={{color: (ticker.changePct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'}}>{fmtPct(ticker.changePct)} · 24h</small></div>
    </div>
  </>;
}
