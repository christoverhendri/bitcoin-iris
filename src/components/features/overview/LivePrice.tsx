'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveTicker } from '@/lib/live/btcTicker';
import { fmtPct, fmtUsd } from '@/lib/format';

type Initial = { last: number; change24hAbs: number; change24hPct: number };

/**
 * The hero's price and 24h move. Starts from the server snapshot, then follows
 * the Binance socket tick by tick. `live` is false for mock data, which must
 * never be overwritten with a real price.
 */
export function LivePrice({ initial, live, children }: { initial: Initial; live: boolean; children?: ReactNode }) {
  const t = useLiveTicker();
  const on = live && t !== null;
  const last = on ? t.last : initial.last;
  const abs = on ? t.last - t.open24h : initial.change24hAbs;
  const pct = on ? (abs / t.open24h) * 100 : initial.change24hPct;
  const up = pct >= 0;
  const [whole, cents] = fmtUsd(last).split('.');

  // Brief tint on each tick so movement is visible.
  const prev = useRef(last);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (last === prev.current) return;
    setDir(last > prev.current ? 'up' : 'down');
    prev.current = last;
    const id = setTimeout(() => setDir(null), 400);
    return () => clearTimeout(id);
  }, [last]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <span
          className="t-display shine"
          style={{ fontSize: 'clamp(56px, 7vw, 92px)', color: dir === 'down' ? 'var(--down)' : 'var(--txt)', transition: 'color 0.4s' }}
        >
          ${whole}
        </span>
        <span style={{ fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--dim)' }}>.{cents}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span
          className="chip"
          style={{
            padding: '6px 12px',
            fontSize: 15,
            background: up ? 'var(--accent-soft)' : 'var(--raise)',
            color: up ? '#ffb27a' : 'var(--down)',
          }}
        >
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" style={{ transform: up ? undefined : 'rotate(180deg)' }}>
            <path d="M5 1 L9 8 L1 8 Z" fill="currentColor" />
          </svg>
          {fmtPct(Math.abs(pct), false)}
        </span>
        <span style={{ fontSize: 15, color: 'var(--mut)' }}>
          {abs >= 0 ? '+' : '−'}${fmtUsd(Math.abs(abs))} in 24 hours
        </span>
        {children}
      </div>
    </>
  );
}
