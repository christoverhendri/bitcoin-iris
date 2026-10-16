'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Tag } from '@/components/primitives';
import type { Tone } from '@/lib/theme/tokens';
import { CATEGORY_COLOR, toEventRow } from '@/lib/features/geopoliticalEvents';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { NewsArticle } from '@/lib/features/news';
import { newsCategoryColor, newsSentimentWord } from '@/lib/features/news';
import type { DetailPayload } from './WorldMap';

const SENTIMENT_TONE: Record<GeoEvent['sentiment'], Tone> = {
  positive: 'up',
  negative: 'down',
  neutral: 'txt',
};

const DAY = 86_400_000;

/** Last 24h; widen to 48h, then fall back to the freshest 15 so it is never empty. */
function recentNews(news: NewsArticle[]): NewsArticle[] {
  const now = Date.now();
  const within = (h: number) => news.filter((a) => a.publishedAt && now - a.publishedAt < h * DAY);
  let list = within(24);
  if (list.length < 5) list = within(48);
  if (list.length < 5) list = news.slice(0, 15);
  return list;
}

export interface EventNewsRailProps {
  events: GeoEvent[];
  news: NewsArticle[];
  activeCats: Set<EventCategory> | null;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onOpenDetail: (payload: DetailPayload | null) => void;
}

export function EventNewsRail({
  events,
  news,
  activeCats,
  selectedKey,
  onSelectKey,
  onOpenDetail,
}: EventNewsRailProps) {
  const [tab, setTab] = useState<'news' | 'events'>('news');
  const [openNews, setOpenNews] = useState<number | null>(null);

  const visibleEvents = useMemo(
    () => events.filter((e) => !activeCats || activeCats.has(e.category)),
    [events, activeCats],
  );
  const newsRows = useMemo(() => recentNews(news), [news]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        {(
          [
            ['news', 'NEWS', newsRows.length],
            ['events', 'EVENTS', visibleEvents.length],
          ] as const
        ).map(([key, label, n]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={active}
              style={{
                flex: 1,
                padding: '8px 10px',
                border: 'none',
                borderRight: key === 'news' ? '1px solid var(--line)' : 'none',
                background: active ? 'var(--panel)' : 'var(--sunk)',
                color: active ? 'var(--txt)' : 'var(--mut)',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                letterSpacing: '.16em',
                cursor: 'pointer',
              }}
            >
              {label} · {n}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'news' ? (
          newsRows.length === 0 ? (
            <div className="iris-micro" style={emptyBox}>
              NO HEADLINES IN WINDOW
            </div>
          ) : (
            newsRows.map((a, i) => {
              const open = openNews === i;
              return (
                <div
                  key={`${a.source}-${i}`}
                  style={{
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenNews(open ? null : i)}
                    aria-expanded={open}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: open ? 'var(--sunk)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px 10px 8px 12px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...headline2, display: '-webkit-box' }}>{a.title}</span>
                      <span className="iris-micro" style={metaRow}>
                        <span style={{ color: newsCategoryColor(a) }}>{a.category}</span>
                        <span>·</span>
                        <span>{a.source}</span>
                        <span>·</span>
                        <span>{a.btcWindow}</span>
                      </span>
                    </span>
                    <span style={{ marginTop: 2, flexShrink: 0, display: 'flex', gap: 6 }}>
                      <Tag label={newsSentimentWord(a.sentiment)} tone={SENTIMENT_TONE[a.sentiment]} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)' }}>
                        {open ? '−' : '+'}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div
                      style={{
                        padding: '0 12px 10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-body, var(--mono))',
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: 'var(--mut)',
                        }}
                      >
                        {a.description || 'No description supplied by the source feed.'}
                      </p>
                      {a.url && (
                        <a
                          href={a.url}
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
                          OPEN SOURCE ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : visibleEvents.length === 0 ? (
          <div className="iris-micro" style={emptyBox}>
            NO EVENTS FOR THIS LAYER
          </div>
        ) : (
          visibleEvents.map((e) => {
            const row = toEventRow(e);
            const selected = e.id === selectedKey;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onSelectKey(e.id);
                  onOpenDetail({ kind: 'event', event: e });
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  borderLeft: `2px solid ${CATEGORY_COLOR[e.category]}`,
                  borderBottom: '1px solid var(--line)',
                  background: selected ? 'var(--sunk)' : 'transparent',
                  padding: '8px 10px 8px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={headline2}>{row.headline}</div>
                <div className="iris-micro" style={metaRow}>
                  <span>{row.place}</span>
                  <span>·</span>
                  <span>{row.source}</span>
                  <span>·</span>
                  <span>{row.ago}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <Tag label={row.sentimentLabel} tone={SENTIMENT_TONE[e.sentiment]} />
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

const emptyBox: CSSProperties = {
  padding: 24,
  display: 'grid',
  placeItems: 'center',
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.16em',
  color: 'var(--dim)',
};
const headline2: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  lineHeight: 1.35,
  color: 'var(--txt)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
const metaRow: CSSProperties = {
  marginTop: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  color: 'var(--dim)',
};
