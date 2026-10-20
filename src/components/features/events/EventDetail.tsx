'use client';

import type { CSSProperties } from 'react';
import { fmtAgo } from '@/lib/format';
import { CATEGORY_COLOR, sentimentWord } from '@/lib/features/geopoliticalEvents/present';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents/types';
import type { SentimentWord } from '@/lib/features/geopoliticalEvents/present';
import type { DetailPayload } from './WorldMap';
import { HeadlineModel } from '@/components/features/sentiment/ModelProvenance';

const SENT_COLOR: Record<SentimentWord, string> = {
  POSITIF: 'var(--up)',
  NEGATIF: 'var(--down)',
  NETRAL: 'var(--mut)',
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
    for (const e of evs) {
      if (e.sentiment === 'positive') bull++;
      else if (e.sentiment === 'negative') bear++;
      else neu++;
    }
    return (
      <div style={wrap}>
        <Header title={`${detail.place} · ${evs.length} events`} onClose={onClose} />
        <div style={badgeRow}>
          <Chip label={`Positive ${bull}`} color="#ffb27a" />
          <Chip label={`Negative ${bear}`} color="var(--down)" />
          <Chip label={`Neutral ${neu}`} color="var(--mut)" />
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto', padding: '0 8px 8px' }}>
          {evs.map((e) => (
            <button key={e.id} type="button" onClick={() => onPick(e)} style={rowBtn}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  marginTop: 6,
                  borderRadius: '50%',
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
  const sent = sentimentWord(e.sentiment);
  return (
    <div style={wrap}>
      <Header title={e.place} onClose={onClose} />
      <div style={badgeRow}>
        <Chip label={sent.charAt(0) + sent.slice(1).toLowerCase()} color={SENT_COLOR[sent]} />
        <Chip label={e.category.charAt(0) + e.category.slice(1).toLowerCase().replace('_', ' ')} color={CATEGORY_COLOR[e.category]} />
      </div>
      <HeadlineModel assessment={e.sentimentAssessment} />
      <div style={dimLine}>
        {e.place} · {e.lat.toFixed(2)}, {e.lon.toFixed(2)}
      </div>
      <div style={{ padding: '4px 18px 18px' }}>
        <div style={sectionLabel}>Headline</div>
        <div style={summaryText}>{e.headline}</div>
        <div style={{ ...rowMeta, marginTop: 6 }}>
          {e.source} · {fmtAgo(new Date(e.publishedAt).toISOString())}
        </div>
        {e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Open source ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '16px 14px 8px 18px' }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </span>
      <button type="button" onClick={onClose} aria-label="Close detail" className="globe-btn" style={{ width: 32, height: 32, flexShrink: 0 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        padding: '5px 11px',
        borderRadius: 999,
        lineHeight: 1.2,
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
  top: 12,
  right: 12,
  width: 340,
  maxWidth: 'calc(100% - 24px)',
  background: '#1a130e',
  borderRadius: 20,
  boxShadow: '0 24px 48px -20px rgba(0,0,0,0.8)',
  zIndex: 6,
  display: 'flex',
  flexDirection: 'column',
};
const badgeRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '4px 18px 10px',
};
const dimLine: CSSProperties = {
  padding: '0 18px 10px',
  fontSize: 12.5,
  color: 'var(--dim)',
};
const sectionLabel: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dim)',
  marginBottom: 4,
};
const summaryText: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.45,
  color: 'var(--txt)',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
const rowMeta: CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  color: 'var(--dim)',
  marginTop: 3,
};
const rowHeadline: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontSize: 14,
  lineHeight: 1.35,
  color: 'var(--txt)',
};
const rowBtn: CSSProperties = {
  display: 'flex',
  gap: 10,
  width: '100%',
  textAlign: 'left',
  whiteSpace: 'normal',
  padding: '9px 10px',
  borderRadius: 12,
  background: 'transparent',
  cursor: 'pointer',
};
const linkStyle: CSSProperties = {
  display: 'inline-flex',
  marginTop: 12,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent-ink)',
  background: 'var(--accent)',
  textDecoration: 'none',
  padding: '8px 14px',
  borderRadius: 999,
};
