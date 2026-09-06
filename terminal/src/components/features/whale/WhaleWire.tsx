'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WhaleEvent } from '@/lib/features/whaleEvents';
import {
  toWhaleEventRow,
  summarizeWhaleFlow,
  netflowColor,
  netflowWord,
} from '@/lib/features/whaleEvents/present';
import { fmtCompact } from '@/lib/format';

/**
 * The whale wire — the terminal's first client-polled panel.
 *
 * Everything else on the page is a server component refreshed by the route's
 * 30s ISR window, which is right for a price snapshot and wrong for an event
 * wire: a reader watching this panel expects a new line to appear while they are
 * looking at it, not on their next navigation. So this one holds an interval and
 * re-reads `/api/whale`.
 *
 * The first paint is server-rendered from `initial`, so there is no empty frame
 * and no layout shift; the interval only ever replaces data that is already
 * there.
 */

const POLL_MS = 60_000;

/**
 * The ages in the rows are re-rendered on their own, faster than the data is
 * refetched — otherwise a row would read "0s ago" for a full minute.
 */
const CLOCK_MS = 15_000;

export interface WhaleWireProps {
  initial: Envelope<WhaleEvent[]>;
  limit?: number;
}

export function WhaleWire({ initial, limit = 50 }: WhaleWireProps) {
  const [env, setEnv] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * `now` starts null and is set after mount.
   *
   * `fmtAgo` defaults to `Date.now()`, which the server and the browser read at
   * different instants — enough to render "59s ago" on one side and "1m ago" on
   * the other, which is a hydration error. Until mount every age is therefore
   * measured against a value derived from the data itself (`baseline` below),
   * which both sides compute identically. After mount it becomes a real clock.
   */
  const [now, setNow] = useState<number | null>(null);

  // Held across renders so a slow response from a previous tick cannot overwrite
  // a newer one.
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    // A background tab does not need a wire. Skipping here rather than pausing
    // the interval keeps the timing simple and resumes on the next tick.
    if (typeof document !== 'undefined' && document.hidden) return;

    const mine = ++seq.current;
    try {
      const res = await fetch(`/api/whale?limit=${limit}`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as Envelope<WhaleEvent[]>;
      if (mine !== seq.current) return;
      setEnv(next);
    } catch {
      // Hold the last good payload. A dropped poll must not blank the panel —
      // stale data with an honest age in the footnote beats an empty wire.
    }
  }, [limit]);

  useEffect(() => {
    // Deferred rather than called straight from the effect body: a synchronous
    // setState here would re-render before paint, and the whole point of
    // `baseline` is that the first paint matches what the server sent.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [refresh]);

  if ((env.isMock && process.env.NODE_ENV !== 'development') || !env.data.length) {
    return <Panel><PanelHeader title="WHALE WIRE" note="Large transfers" />
      <p style={{ padding: 16, color: 'var(--mut)' }}>Transaction data unavailable.</p>
    </Panel>;
  }
  const events = env.data;
  const summary = summarizeWhaleFlow(events);

  // Pre-mount clock substitute: the newest timestamp in the payload. Derived
  // from the data, so SSR and hydration agree by construction.
  const baseline = Date.parse(env.asOf ?? events[0]?.ts ?? '') || 0;
  const clock = now ?? baseline;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 320 }}>
      <PanelHeader
        title="WHALE WIRE"
        note="Large transfers, all chains · click a row for detail"
        right={<MockBadge env={env} />}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Directional summary over the last 24h of the feed */}
        <div
          style={{
            padding: 12,
            borderBottom: '1px solid var(--line)',
            background: 'var(--sunk)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)' }}>
              EXCHANGE NETFLOW 24H
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                color: netflowColor(summary.netUsd),
              }}
            >
              {summary.netUsd >= 0 ? '+' : '-'}
              {fmtCompact(Math.abs(summary.netUsd))}
            </span>
            <Tag
              label={netflowWord(summary.netUsd)}
              tone={summary.netUsd > 0 ? 'down' : summary.netUsd < 0 ? 'up' : 'mut'}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11 }}>
            {(
              [
                ['INFLOW', fmtCompact(summary.inflowUsd), 'var(--down)', summary.inflowCount],
                ['OUTFLOW', fmtCompact(summary.outflowUsd), 'var(--up)', summary.outflowCount],
                ['EVENTS', String(summary.count), 'var(--txt)', events.length],
              ] as const
            ).map(([label, value, color, n]) => (
              <div key={label}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--mut)' }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color }}>{value}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--dim)' }}>
                  {n} tx
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Event list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {events.length === 0 ? (
            <div
              style={{
                padding: '20px 12px',
                textAlign: 'center',
                color: 'var(--dim)',
                fontFamily: 'var(--mono)',
                fontSize: 9,
              }}
            >
              No whale movement on the wire
            </div>
          ) : (
            events.map((e, i) => {
              const row = toWhaleEventRow(e, clock);
              const open = openId === e.id;
              return (
                <div
                  key={e.id}
                  style={{
                    borderBottom: i < events.length - 1 ? '1px solid var(--line)' : 'none',
                    borderLeft: `2px solid ${
                      row.tier === 'HIGH' ? row.biasColor : 'transparent'
                    }`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : e.id)}
                    aria-expanded={open}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: open ? 'var(--sunk)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ minWidth: 'fit-content', marginTop: 2 }}>
                      <Tag
                        label={row.biasWord}
                        tone={e.bias === 'bullish' ? 'up' : e.bias === 'bearish' ? 'down' : 'mut'}
                      />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'var(--mono)',
                          fontSize: 9,
                          color: 'var(--txt)',
                          marginBottom: 3,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {row.amount} · {row.usd}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          fontFamily: 'var(--mono)',
                          fontSize: 8,
                          color: 'var(--dim)',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ color: row.kindColor, letterSpacing: '.1em' }}>
                          {row.kindLabel}
                        </span>
                        <span>·</span>
                        <span style={{ color: row.tierColor }}>{row.tier} IMPACT</span>
                        <span>·</span>
                        <span>{row.chain}</span>
                        <span>·</span>
                        <span>{row.ago}</span>
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        color: 'var(--mut)',
                        marginTop: 1,
                      }}
                    >
                      {open ? '−' : '+'}
                    </span>
                  </button>

                  {open && (
                    <div
                      style={{
                        padding: '0 12px 12px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          lineHeight: 1.5,
                          color: 'var(--mut)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {row.route}
                      </p>
                      {row.txUrl && (
                        <a
                          href={row.txUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 9,
                            letterSpacing: '.12em',
                            color: 'var(--blue)',
                            textDecoration: 'none',
                          }}
                        >
                          OPEN TRANSACTION ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <SourceFootnote env={env} now={clock} />
    </Panel>
  );
}
