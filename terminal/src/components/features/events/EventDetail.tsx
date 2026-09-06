'use client';

import type { CSSProperties } from 'react';
import { fmtAgo } from '@/lib/format';
import {
  CATEGORY_COLOR,
  IMPACT_TIER_COLOR,
  impactTier,
  sentimentWord,
} from '@/lib/features/geopoliticalEvents/present';
import type { GeoEvent, SentimentWord } from '@/lib/features/geopoliticalEvents';
import type { DetailPayload } from './WorldMap';

const SENT_COLOR: Record<SentimentWord, string> = {
  BULLISH: 'var(--up)',
  BEARISH: 'var(--down)',
  NEUTRAL: 'var(--mut)',
};

export interface EventDetailProps {
  detail: DetailPayload | null;
  onClose: () => void;
  /** Cluster row click swaps the popup to that single event. */
  onPick: (event: GeoEvent) => void;
}

export function EventDetail({ detail, onClose, onPick }: EventDetailProps) {
  if (!detail) return null;

  if (detail.kind === 'cluster') {
    const evs = detail.events;
    let bull = 0;
    let bear = 0;
    let neu = 0;
    let maxImpact = 0;
    for (const e of evs) {
      if (e.sentiment === 'positive') bull++;
      else if (e.sentiment === 'negative') bear++;
      else neu++;
      if (e.impact > maxImpact) maxImpact = e.impact;
    }
    const tier = impactTier(maxImpact);
    return (
      <div style={wrap} className="iris-micro">
        <Header title={`${detail.place} · ${evs.length} EVENTS`} onClose={onClose} />
        <div style={badgeRow}>
          <Chip label={`MAX ${tier}`} color={IMPACT_TIER_COLOR[tier]} />
          <Chip label={`BULL ${bull}`} color="var(--up)" />
          <Chip label={`BEAR ${bear}`} color="var(--down)" />
          <Chip label={`NEU ${neu}`} color="var(--mut)" />
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--line)' }}>
          {evs.map((e) => (
            <button key={e.id} type="button" onClick={() => onPick(e)} style={rowBtn}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  marginTop: 3,
                  flexShrink: 0,
                  background: CATEGORY_COLOR[e.category],
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={rowHeadline}>{e.headline}</span>
                <span style={rowMeta}>
                  {e.place} · {fmtAgo(new Date(e.publishedAt).toISOString())}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const e = detail.event;
  const tier = impactTier(e.impact);
  const sent = sentimentWord(e.sentiment);
  return (
    <div style={wrap} className="iris-micro">
      <Header title={e.place} onClose={onClose} />
      <div style={badgeRow}>
        <Chip label={tier} color={IMPACT_TIER_COLOR[tier]} />
        <Chip label={sent} color={SENT_COLOR[sent]} />
        <Chip label={`LEVEL ${Math.round(e.impact)}`} color="var(--mut)" />
        <Chip label={e.category.replace('_', ' ')} color={CATEGORY_COLOR[e.category]} />
      </div>
      <div style={dimLine}>
        {e.place} · {e.lat.toFixed(2)}, {e.lon.toFixed(2)}
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--line)' }}>
        <div style={sectionLabel}>SUMMARY</div>
        <div style={summaryText}>{e.headline}</div>
        <div style={{ ...rowMeta, marginTop: 6 }}>
          {e.source} · {fmtAgo(new Date(e.publishedAt).toISOString())}
        </div>
        {e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            OPEN SOURCE ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          letterSpacing: '.12em',
          color: 'var(--txt)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        ● {title}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close detail"
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12,
          lineHeight: 1,
          color: 'var(--mut)',
          background: 'transparent',
          border: '1px solid var(--line2)',
          width: 18,
          height: 18,
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.12em',
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        padding: '3px 7px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}

const wrap: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 320,
  maxWidth: 'calc(100% - 16px)',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  boxShadow: 'none',
  zIndex: 6,
  display: 'flex',
  flexDirection: 'column',
};
const badgeRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  padding: '8px 10px',
};
const dimLine: CSSProperties = {
  padding: '0 10px 8px',
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.08em',
  color: 'var(--dim)',
};
const sectionLabel: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.16em',
  color: 'var(--dim)',
  marginBottom: 4,
};
const summaryText: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  lineHeight: 1.45,
  color: 'var(--txt)',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
const rowMeta: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.06em',
  color: 'var(--dim)',
  marginTop: 2,
};
const rowHeadline: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontFamily: 'var(--mono)',
  fontSize: 9.5,
  lineHeight: 1.35,
  color: 'var(--txt)',
};
const rowBtn: CSSProperties = {
  display: 'flex',
  gap: 7,
  width: '100%',
  textAlign: 'left',
  padding: '7px 10px',
  borderBottom: '1px solid var(--line)',
  background: 'transparent',
  cursor: 'pointer',
};
const linkStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.14em',
  color: 'var(--blue)',
  textDecoration: 'none',
  border: '1px solid var(--line2)',
  padding: '4px 8px',
};
