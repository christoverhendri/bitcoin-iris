'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { NewsHistoryControl } from '../news/NewsHistoryControl';
import { Tag } from '@/components/primitives';
import type { Tone } from '@/lib/theme/tokens';
import { CATEGORY_COLOR, toEventRow } from '@/lib/features/geopoliticalEvents/present';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { NewsArticle } from '@/lib/features/news';
import { newsCategoryColor, newsImpactColor, newsAssessmentLabel, newsRankingLabel } from '@/lib/features/news/present';
import { SemanticDetails } from '../news/SemanticDetails';
import type { DetailPayload } from './WorldMap';

const SENTIMENT_TONE: Record<GeoEvent['sentiment'], Tone> = {
  positive: 'up',
  negative: 'down',
  neutral: 'txt',
};

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
  const [openNews, setOpenNews] = useState<string | null>(null);

  const visibleEvents = useMemo(
    () => events.filter((e) => !activeCats || activeCats.has(e.category)),
    [events, activeCats],
  );
  const [visibleCount, setVisibleCount] = useState(20);
  const [source, setSource] = useState('ALL');
  const [query, setQuery] = useState('');
  const sources = [...new Set(news.map(a => a.source))].sort();
  const filteredNews = news.filter(a => (source === 'ALL' || a.source === source) && a.title.toLowerCase().includes(query.toLowerCase()));
  const newsRows = filteredNews.slice(0, visibleCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        {(
          [
            ['news', 'NEWS', news.length],
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

      {tab === 'news' && <>
        <div className="news-filters">
          <input aria-label="Search headlines" placeholder="Search headlines…" value={query} onChange={e => { setQuery(e.target.value); setVisibleCount(20); }} />
          <select aria-label="News source" value={source} onChange={e => { setSource(e.target.value); setVisibleCount(20); }}>
            <option value="ALL">All sources</option>
            {sources.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <NewsHistoryControl shown={newsRows.length} total={filteredNews.length} onMore={() => setVisibleCount((n) => n + 20)} />
      </>}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'news' ? (
          newsRows.length === 0 ? (
            <div className="iris-micro" style={emptyBox}>
              {news.length ? 'NO HEADLINES MATCH THESE FILTERS' : 'NO HEADLINES AVAILABLE'}
            </div>
          ) : (
            newsRows.map((a) => {
              const open = openNews === (a.url || a.title);
              return (
                <div
                  key={`${a.source}:${a.url || a.title}`}
                  style={{
                    borderBottom: '1px solid var(--line)',
                    borderLeft: `2px solid ${
                      a.impactTier === 'HIGH' ? newsImpactColor('HIGH') : 'transparent'
                    }`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenNews(open ? null : (a.url || a.title))}
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
                        <span style={{ color: newsImpactColor(a.impactTier), letterSpacing: '.1em' }}>
                          {newsRankingLabel(a)}
                        </span>
                        <span>·</span>
                        <span style={{ color: newsCategoryColor(a) }}>{a.category}</span>
                        <span>·</span>
                        <span>{a.source}</span>
                        <span>·</span>
                        <span>{a.btcWindow}</span>
                      </span>
                    </span>
                    <span style={{ marginTop: 2, flexShrink: 0, display: 'flex', gap: 6 }}>
                      <Tag label={newsAssessmentLabel(a)} tone={SENTIMENT_TONE[a.sentiment]} />
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
                      <SemanticDetails semantic={a.semantic} />
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
  fontSize: 12,
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
  fontSize: 10,
  color: 'var(--mut)',
};
