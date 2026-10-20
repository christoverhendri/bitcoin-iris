import Link from 'next/link';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SentimentData } from '@/lib/features/sentiment';
import type { NewsArticle } from '@/lib/features/news';
import { sentimentSource } from '@/lib/sentiment/types';
import { softCase } from '@/lib/softCase';

export interface IntelligenceFeedProps {
  sentiment: Envelope<SentimentData>;
  news: Envelope<NewsArticle[]>;
}

const WORD: Record<NewsArticle['sentiment'], string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

/** Tag colours: the accent for positive, sand for negative, a quiet tone for neutral. */
function tag(s: NewsArticle['sentiment']) {
  if (s === 'positive') return { bg: 'var(--accent-soft)', fg: '#ffb27a' };
  if (s === 'negative') return { bg: '#2a211b', fg: '#e8d5c4' };
  return { bg: '#221912', fg: '#c9b8aa' };
}

/** P(positive) − P(negative) from the model, when the model scored the headline. */
function score(a: NewsArticle): string | null {
  const p = a.sentimentAssessment?.probabilities;
  if (!p) return null;
  const v = p.positive - p.negative;
  if (Math.abs(v) < 0.005) return '0.00';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
}

/**
 * The latest headlines, each labelled by the sentiment model, with the mix of
 * labels over the whole sample in the header. A label is the tone of the text,
 * not a price call.
 */
export function IntelligenceFeed({ sentiment, news }: IntelligenceFeedProps) {
  const s = sentiment.data;
  const articles = news.data.slice(0, 10);
  const engine = sentimentSource(articles.find((a) => a.sentimentAssessment)?.sentimentAssessment);

  return (
    <Panel>
      <PanelHeader title="Intelligence feed" note={`${engine} · ${s.headlineCount} headlines`} right={<MockBadge env={news} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '6px 26px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(
              [
                ['Positive', s.positivePct, '#ffb27a'],
                ['Neutral', s.neutralPct, 'var(--txt)'],
                ['Negative', s.negativePct, 'var(--down)'],
              ] as const
            ).map(([label, pct, color]) => (
              <span key={label} className="iris-inset" style={{ padding: '10px 16px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--dim)' }}>{label}</span>
                <span style={{ fontSize: 20, fontWeight: 600, color }}>{pct.toFixed(0)}%</span>
              </span>
            ))}
          </div>
          <Link href="/sentiment" className="ember-btn">
            Open all news
          </Link>
        </div>

        {articles.length === 0 ? (
          <div className="t-caption" style={{ padding: '20px 0', textAlign: 'center' }}>
            No headlines from the feeds right now.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 32px' }}>
            {articles.map((a, i) => {
              const t = tag(a.sentiment);
              const sc = score(a);
              const body = (
                <>
                  <span
                    style={{
                      flex: '0 0 auto',
                      minWidth: 78,
                      padding: '5px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: 'center',
                      background: t.bg,
                      color: t.fg,
                    }}
                  >
                    {WORD[a.sentiment]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--txt)', wordBreak: 'break-word' }}>{a.title}</span>
                    <span style={{ fontSize: 13, color: 'var(--dim)' }}>
                      {a.source} · {softCase(a.category.replace('_', ' '))} · {a.btcWindow}
                    </span>
                  </span>
                  {sc ? (
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e9ddd2' }} title="Model P(positive) − P(negative)">
                      {sc}
                    </span>
                  ) : null}
                </>
              );
              const style = {
                flex: '1 1 440px',
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 12px',
                margin: '0 -12px',
              } as const;
              return a.url ? (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="ember-row" style={style} title={a.description || undefined}>
                  {body}
                </a>
              ) : (
                <div key={i} className="ember-row" style={style} title={a.description || undefined}>
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SourceFootnote env={news} />
    </Panel>
  );
}
