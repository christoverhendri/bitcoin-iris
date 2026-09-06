import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { NewsArticle } from '@/lib/features/news';
import type { Tone } from '@/lib/theme/tokens';

export type NewsFilter = 'all' | 'bullish' | 'bearish';

export interface NewsWireProps {
  news: Envelope<NewsArticle[]>;
  filter: NewsFilter;
}

function sentimentLabel(s: NewsArticle['sentiment']): string {
  return s === 'positive' ? 'BULL' : s === 'negative' ? 'BEAR' : 'NEUTRAL';
}

function sentimentTone(s: NewsArticle['sentiment']): Tone {
  return s === 'positive' ? 'up' : s === 'negative' ? 'down' : 'txt';
}

const FILTERS: { key: NewsFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'bullish', label: 'BULLISH' },
  { key: 'bearish', label: 'BEARISH' },
];

export function NewsWire({ news, filter }: NewsWireProps) {
  const all = news.data;
  const bullish = all.filter((a) => a.sentiment === 'positive').length;
  const bearish = all.filter((a) => a.sentiment === 'negative').length;
  const neutral = all.length - bullish - bearish;

  const visible =
    filter === 'bullish'
      ? all.filter((a) => a.sentiment === 'positive')
      : filter === 'bearish'
        ? all.filter((a) => a.sentiment === 'negative')
        : all;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
      <PanelHeader
        title="NEWS WIRE"
        note={`${bullish} BULL · ${bearish} BEAR · ${neutral} NEUTRAL`}
        right={<MockBadge env={news} />}
      />

      {/* filter pills — plain links, work without client JS */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '6px 10px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--sunk)',
        }}
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <a
              key={f.key}
              href={f.key === 'all' ? '?' : `?filter=${f.key}`}
              className="iris-micro pill-btn"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                letterSpacing: '.14em',
                padding: '5px 10px',
                color: active ? 'var(--txt)' : 'var(--mut)',
                border: '1px solid var(--line2)',
                background: active ? '#1b2430' : 'transparent',
              }}
            >
              {f.label}
            </a>
          );
        })}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {visible.length > 0 ? (
          visible.map((a, i) => (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                borderBottom: i < visible.length - 1 ? '1px solid var(--line)' : 'none',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ minWidth: 'fit-content', marginTop: 2 }}>
                <Tag label={sentimentLabel(a.sentiment)} tone={sentimentTone(a.sentiment)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--txt)',
                    lineHeight: 1.35,
                    wordBreak: 'break-word',
                  }}
                >
                  {a.title}
                </div>
                <div
                  className="iris-micro"
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginTop: 3,
                    fontFamily: 'var(--mono)',
                    fontSize: 8.5,
                    color: 'var(--dim)',
                  }}
                >
                  <span>{a.source}</span>
                  <span>·</span>
                  <span>BTC {a.btcWindow} window</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            className="iris-micro"
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              padding: 24,
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.16em',
              color: 'var(--dim)',
            }}
          >
            NO HEADLINES FOR THIS FILTER
          </div>
        )}
      </div>

      <SourceFootnote env={news} />
    </Panel>
  );
}
