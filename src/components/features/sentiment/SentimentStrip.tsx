import type { ReactNode } from 'react';
import { MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import { fmtPct } from '@/lib/format';
import type { FearGreedData } from '@/lib/features/fearGreed';
import type { SentimentData } from '@/lib/features/sentiment';
import type { NewsArticle } from '@/lib/features/news';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents';

const DAY_MS = 86_400_000;

export interface SentimentStripProps {
  fearGreed: Envelope<FearGreedData>;
  sentiment: Envelope<SentimentData>;
  news: Envelope<NewsArticle[]>;
  events: Envelope<GeoEvent[]>;
}

const WORD: Record<FearGreedData['classification'], string> = {
  'Extreme Fear': 'Extreme fear',
  Fear: 'Fear',
  Neutral: 'Neutral',
  Greed: 'Greed',
  'Extreme Greed': 'Extreme greed',
};

/**
 * The page's opening card: the Fear & Greed index set large on the left, and
 * three tiles for the other inputs (the headline mix from the sentiment model,
 * the tone of the newest headlines, the world-event count). Every figure is
 * counted from the envelopes; a tile whose source is missing says so.
 */
export function SentimentStrip({ fearGreed, sentiment, news, events }: SentimentStripProps) {
  const fg = fearGreed.data;
  const s = sentiment.data;
  const mixTotal = s.positivePct + s.neutralPct + s.negativePct || 1;

  let nPos = 0;
  let nNeg = 0;
  let nNeu = 0;
  for (const a of news.data) {
    if (a.sentiment === 'positive') nPos++;
    else if (a.sentiment === 'negative') nNeg++;
    else nNeu++;
  }
  const newsWord = nPos > nNeg ? 'More positive' : nNeg > nPos ? 'More negative' : 'Balanced';

  const ev = events.data;
  // Deterministic recency reference: newest item in the feed, not wall clock.
  const refTs = ev.length ? Math.max(...ev.map((e) => e.publishedAt)) : 0;
  const last24 = ev.filter((e) => refTs - e.publishedAt <= DAY_MS).length;
  const greedy = fg.classification === 'Greed' || fg.classification === 'Extreme Greed';

  return (
    <div className="rise" style={{ ['--i' as string]: 2 }}>
    <section className="iris-card iris-panel" aria-label="Market mood" style={{ padding: 32, display: 'flex', flexWrap: 'wrap', gap: 32 }}>
      <div className="ember-halo" aria-hidden="true" style={{ top: -320, left: -200 }} />
      <div style={{ position: 'relative', zIndex: 4, flex: '1 1 280px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>Market mood</h2>
          <MockBadge env={fearGreed} />
        </div>
        {fearGreed.isMock ? (
          <span style={{ color: 'var(--dim)' }}>Fear & Greed is not available from alternative.me right now.</span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span className={`t-display${greedy ? ' t-accent' : ''}`} style={{ fontSize: 96, color: greedy ? 'var(--accent)' : 'var(--txt)' }}>
                {fg.value}
              </span>
              <span className="t-title" style={{ fontSize: 28 }}>
                {WORD[fg.classification]}
              </span>
            </div>
            <span style={{ fontSize: 15, color: 'var(--mut)' }}>
              Fear & Greed index ·{' '}
              <span style={{ color: fg.changePct >= 0 ? '#ffb27a' : 'var(--down)', fontWeight: 600 }}>{fmtPct(fg.changePct)}</span> vs yesterday
            </span>
          </>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 4, flex: '999 1 560px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Tile label="Headline mix" env={sentiment}>
          <div style={{ display: 'flex', height: 12, gap: 3 }}>
            <span className="ember-grow" style={{ width: `${(s.positivePct / mixTotal) * 100}%`, background: 'var(--accent)', borderRadius: 999 }} />
            <span style={{ width: `${(s.neutralPct / mixTotal) * 100}%`, background: '#5a4130', borderRadius: 999 }} />
            <span style={{ width: `${(s.negativePct / mixTotal) * 100}%`, background: '#c9b8aa', borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 12 }}>
            <span style={{ color: '#ffb27a', fontWeight: 600 }}>{Math.round(s.positivePct)}% pos</span>
            <span style={{ color: 'var(--mut)' }}>{Math.round(s.neutralPct)}% neu</span>
            <span style={{ color: 'var(--down)' }}>{Math.round(s.negativePct)}% neg</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 8 }}>{s.headlineCount} headlines, last 7 days</div>
        </Tile>

        <Tile label="Newest headlines" env={news}>
          <div className="t-title" style={{ fontSize: 26, color: nPos > nNeg ? '#ffb27a' : nNeg > nPos ? 'var(--down)' : 'var(--txt)' }}>
            {newsWord}
          </div>
          <div style={{ fontSize: 14, color: 'var(--mut)', marginTop: 10 }}>
            {nPos} positive · {nNeg} negative · {nNeu} neutral
          </div>
        </Tile>

        <Tile label="World events" env={events}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="t-display" style={{ fontSize: 44 }}>
              {ev.length}
            </span>
            <span style={{ fontSize: 15, color: 'var(--mut)' }}>tracked</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--mut)', marginTop: 10 }}>{last24} in the last 24 hours</div>
        </Tile>
      </div>
    </section>
    </div>
  );
}

function Tile({ label, env, children }: { label: string; env: Envelope<unknown>; children: ReactNode }) {
  return (
    <div className="iris-inset" style={{ padding: '18px 20px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--dim)' }}>{label}</span>
        <MockBadge env={env} />
      </div>
      {/* Mocked: no placeholder numbers, just say the source is missing. */}
      {env.isMock ? <span style={{ fontSize: 13, color: 'var(--dim)' }}>data belum tersedia</span> : children}
    </div>
  );
}
