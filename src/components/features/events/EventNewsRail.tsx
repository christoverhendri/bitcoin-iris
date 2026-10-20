'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Tag } from '@/components/primitives';
import type { Tone } from '@/lib/theme/tokens';
import { CATEGORY_COLOR, toEventRow } from '@/lib/features/geopoliticalEvents/present';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { NewsArticle } from '@/lib/features/news';
import { newsCategoryColor, newsSentimentWord } from '@/lib/features/news/present';
import type { DetailPayload } from './WorldMap';
import { softCase } from '@/lib/softCase';
import { HeadlineModel } from '@/components/features/sentiment/ModelProvenance';

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
      <div className="seg" role="group" aria-label="Rail view" style={{ margin: 12, alignSelf: 'flex-start', flexShrink: 0 }}>
        {(
          [
            ['news', 'News', newsRows.length],
            ['events', 'Events', visibleEvents.length],
          ] as const
        ).map(([key, label, n]) => (
          <button key={key} type="button" className="seg-btn" onClick={() => setTab(key)} aria-pressed={tab === key}>
            {label} · {n}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'news' ? (
          newsRows.length === 0 ? (
            <div style={emptyBox}>
              No headlines in window
            </div>
          ) : (
            newsRows.map((a, i) => {
              const open = openNews === i;
              return (
                <div
                  key={`${a.source}-${i}`}
                  style={{ margin: '0 8px' }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenNews(open ? null : i)}
                    aria-expanded={open}
                    className="ember-row"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      whiteSpace: 'normal',
                      background: open ? 'var(--raise)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '12px 14px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...headline2, display: '-webkit-box' }}>{a.title}</span>
                      <span style={metaRow}>
                        <span style={{ color: newsCategoryColor(a) }}>{softCase(a.category)}</span>
                        <span>·</span>
                        <span>{a.source}</span>
                        <span>·</span>
                        <span>{a.btcWindow}</span>
                      </span>
                      <HeadlineModel assessment={a.sentimentAssessment} />
                    </span>
                    <span style={{ marginTop: 2, flexShrink: 0, display: 'flex', gap: 6 }}>
                      <Tag label={newsSentimentWord(a.sentiment)} tone={SENTIMENT_TONE[a.sentiment]} />
                      <span style={{ fontSize: 14, color: 'var(--mut)' }}>
                        {open ? '−' : '+'}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div
                      style={{
                        padding: '0 14px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-body, var(--mono))',
                          fontSize: 13.5,
                          lineHeight: 1.55,
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
                          style={{ fontSize: 13, fontWeight: 600 }}
                        >
                          Open source ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : visibleEvents.length === 0 ? (
          <div style={emptyBox}>
            No events for this layer
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
                className="ember-row"
                style={{
                  display: 'block',
                  width: 'calc(100% - 16px)',
                  margin: '0 8px',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                  background: selected ? 'var(--raise-2)' : 'transparent',
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: '50%', flexShrink: 0, background: CATEGORY_COLOR[e.category] }} />
                  <span style={headline2}>{row.headline}</span>
                </div>
                <div style={metaRow}>
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
  padding: 28,
  display: 'grid',
  placeItems: 'center',
  fontSize: 13,
  color: 'var(--dim)',
};
const headline2: CSSProperties = {
  fontSize: 14,
  fontWeight: 550,
  lineHeight: 1.4,
  color: 'var(--txt)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
const metaRow: CSSProperties = {
  marginTop: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  fontSize: 12.5,
  color: 'var(--dim)',
};
