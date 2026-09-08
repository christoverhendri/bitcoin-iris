'use client';

import { useState } from 'react';
import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import { NewsHistoryControl } from '../news/NewsHistoryControl';
import { ArchiveMore } from '../news/ArchiveMore';
import { useLiveNews } from '../news/useLiveNews';
import { NewsRefreshStatus } from '../news/NewsRefreshStatus';
import type { Envelope } from '@/lib/envelope';
import type { SentimentData } from '@/lib/features/sentiment';
import type { NewsArticle } from '@/lib/features/news';
import { newsSentimentWord, newsAssessmentLabel, newsRankingLabel, newsCategoryColor, newsImpactColor } from '@/lib/features/news/present';
import { SemanticDetails } from '../news/SemanticDetails';

export interface IntelligenceFeedProps {
  sentiment: Envelope<SentimentData>;
  news: Envelope<NewsArticle[]>;
}

function toneFor(s: NewsArticle['sentiment']): 'up' | 'down' | 'txt' {
  return s === 'positive' ? 'up' : s === 'negative' ? 'down' : 'txt';
}

export function IntelligenceFeed({ sentiment, news: initialNews }: IntelligenceFeedProps) {
  const liveNews = useLiveNews(initialNews);
  const { news } = liveNews;
  const s = sentiment.data;
  const [visibleCount, setVisibleCount] = useState(10);
  const articles = news.data.slice(0, visibleCount);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const overall: 'positive' | 'negative' | 'neutral' =
    s.score > 0.1 ? 'positive' : s.score < -0.1 ? 'negative' : 'neutral';

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 300 }}>
      <PanelHeader
        title="INTELLIGENCE FEED"
        note="Sentiment + News · click a headline for detail"
        right={<MockBadge env={news} />}
      />

      <NewsRefreshStatus {...liveNews} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Sentiment summary */}
        <div style={{ padding: 12, borderBottom: '1px solid var(--line)', background: 'var(--sunk)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)' }}>
              SENTIMENT SCORE
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                color:
                  overall === 'positive'
                    ? 'var(--up)'
                    : overall === 'negative'
                      ? 'var(--down)'
                      : 'var(--txt)',
              }}
            >
              {s.score >= 0 ? '+' : ''}
              {s.score.toFixed(2)}
            </span>
            <Tag label={newsSentimentWord(overall)} tone={toneFor(overall)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11 }}>
            {(
              [
                ['BULLISH', s.positivePct, 'var(--up)'],
                ['NEUTRAL', s.neutralPct, 'var(--txt)'],
                ['BEARISH', s.negativePct, 'var(--down)'],
              ] as const
            ).map(([label, pct, color]) => (
              <div key={label}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--mut)' }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color }}>
                  {pct.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* News list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {articles.length === 0 ? (
            <div
              style={{
                padding: '20px 12px',
                textAlign: 'center',
                color: 'var(--dim)',
                fontFamily: 'var(--mono)',
                fontSize: 9,
              }}
            >
              No news available
            </div>
          ) : (
            articles.map((a, i) => {
              const key = `${a.source}:${a.url || a.title}`;
              const open = openKey === key;
              return (
                <div
                  key={key}
                  style={{
                    borderBottom: i < articles.length - 1 ? '1px solid var(--line)' : 'none',
                    borderLeft: `2px solid ${
                      a.impactTier === 'HIGH' ? newsImpactColor('HIGH') : 'transparent'
                    }`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? null : key)}
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
                      <Tag label={newsAssessmentLabel(a)} tone={toneFor(a.sentiment)} />
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
                        {a.title}
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
          )}
        </div>
      </div>

      <NewsHistoryControl shown={articles.length} total={news.data.length} onMore={() => setVisibleCount((n) => n + 20)} />
      <ArchiveMore {...liveNews} />
      <SourceFootnote env={news} />
    </Panel>
  );
}
