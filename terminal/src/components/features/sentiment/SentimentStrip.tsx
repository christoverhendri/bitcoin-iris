import type { CSSProperties, ReactNode } from 'react';
import { MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import { fmtCompact, fmtPct, fmtZ } from '@/lib/format';
import { signTone, toneVar, type Tone } from '@/lib/theme/tokens';
import type { FearGreedData } from '@/lib/features/fearGreed';
import { toFearGreedLabel } from '@/lib/features/fearGreed';
import type { SentimentData } from '@/lib/features/sentiment';
import type { NewsArticle } from '@/lib/features/news';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { WhaleEvent } from '@/lib/features/whaleEvents';
import { summarizeWhaleFlow, netflowColor, netflowWord } from '@/lib/features/whaleEvents/present';

const DAY_MS = 86_400_000;

export interface SentimentStripProps {
  fearGreed: Envelope<FearGreedData>;
  sentiment: Envelope<SentimentData>;
  news: Envelope<NewsArticle[]>;
  events: Envelope<GeoEvent[]>;
  whale: Envelope<WhaleEvent[]>;
}

/**
 * One compact band summarising every input on the page: fear & greed, the
 * social score, the sentiment mix, news tone and the world-event count. Cells
 * are hairline-separated (the 1px grid gap is the border) and wrap on narrow
 * screens; on desktop it stays a single row.
 */
export function SentimentStrip({ fearGreed, sentiment, news, events, whale }: SentimentStripProps) {
  const fg = fearGreed.data;
  const fgLabel = toFearGreedLabel(fg);

  const s = sentiment.data;
  const socialWord = s.score > 0.1 ? 'NET BULLISH' : s.score < -0.1 ? 'NET BEARISH' : 'BALANCED';
  const mixTotal = s.positivePct + s.neutralPct + s.negativePct || 1;
  const posW = (s.positivePct / mixTotal) * 100;
  const neuW = (s.neutralPct / mixTotal) * 100;
  const negW = (s.negativePct / mixTotal) * 100;

  let nPos = 0;
  let nNeg = 0;
  let nNeu = 0;
  for (const a of news.data) {
    if (a.sentiment === 'positive') nPos++;
    else if (a.sentiment === 'negative') nNeg++;
    else nNeu++;
  }
  const newsWord = nPos > nNeg ? 'NET BULLISH' : nNeg > nPos ? 'NET BEARISH' : 'MIXED';
  const newsTone: Tone = nPos > nNeg ? 'up' : nNeg > nPos ? 'down' : 'txt';

  const ev = events.data;
  // Deterministic recency reference: newest item in the feed, not wall clock.
  const refTs = ev.length ? Math.max(...ev.map((e) => e.publishedAt)) : 0;
  const last24 = ev.filter((e) => refTs - e.publishedAt <= DAY_MS).length;

  // Windowed from the newest event rather than the wall clock, for the same
  // reason as `refTs` above.
  const flow = summarizeWhaleFlow(whale.data);

  return (
    <div
      className="sentiment-summary"
      style={{
        display: 'grid',
        gap: 1,
        background: 'var(--line)',
        minWidth: 0,
      }}
    >
      <Cell label="FEAR & GREED" env={fearGreed}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigValue, color: fgLabel.color }}>{fg.value}</span>
          <span style={valueWord}>{fgLabel.label.toUpperCase()}</span>
        </div>
        <div style={deltaLine}>{fmtPct(fg.changePct)} 24h</div>
      </Cell>

      <Cell label="RSS + FEAR & GREED" env={sentiment}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigValue, color: toneVar(signTone(s.score)) }}>{fmtZ(s.score)}</span>
          <span style={valueWord}>{socialWord}</span>
        </div>
      </Cell>

      <Cell label="SENTIMENT MIX" env={sentiment}>
        <div style={{ display: 'flex', height: 6, border: '1px solid var(--line2)' }}>
          <span style={{ width: `${posW}%`, background: 'var(--up)' }} />
          <span style={{ width: `${neuW}%`, background: 'var(--mut)' }} />
          <span style={{ width: `${negW}%`, background: 'var(--down)' }} />
        </div>
        <div style={{ ...deltaLine, marginTop: 4 }}>
          Bull {Math.round(s.positivePct)}% · Neutral {Math.round(s.neutralPct)}% · Bear {Math.round(s.negativePct)}%
        </div>
      </Cell>

      <Cell label="NEWS TONE" env={news}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...midValue, color: toneVar(newsTone) }}>{newsWord}</span>
        </div>
        <div style={deltaLine}>
          +{nPos} / -{nNeg}
          {nNeu ? ` · ${nNeu} neu` : ''}
        </div>
      </Cell>

      <Cell label="WHALE FLOW 24H" env={whale}>
        {whale.isMock || !whale.data.length ? <span style={valueWord}>UNAVAILABLE</span> : <>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...midValue, color: netflowColor(flow.netUsd) }}>
            {flow.netUsd >= 0 ? '+' : '-'}
            {fmtCompact(Math.abs(flow.netUsd))}
          </span>
          <span style={valueWord}>{netflowWord(flow.netUsd)}</span>
        </div>
        <div style={deltaLine}>
          in {flow.inflowCount} / out {flow.outflowCount} · {flow.count} tx
        </div>
        </>}
      </Cell>

      <Cell label="WORLD EVENTS" env={events}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigValue, color: 'var(--txt)' }}>{ev.length}</span>
          <span style={valueWord}>TRACKED</span>
        </div>
        <div style={deltaLine}>{last24} in 24h</div>
      </Cell>
    </div>
  );
}

function Cell({
  label,
  env,
  children,
}: {
  label: string;
  env: Envelope<unknown>;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', background: 'var(--panel)', padding: '10px 14px', minWidth: 0 }}>
      <span style={{ position: 'absolute', top: 5, right: 5 }}>
        <MockBadge env={env} />
      </span>
      <div style={cellLabel}>{label}</div>
      <div style={{ marginTop: 5 }}>{children}</div>
    </div>
  );
}

const cellLabel: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.14em',
  color: 'var(--dim)',
};
const bigValue: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontWeight: 700,
  fontSize: 22,
  lineHeight: 1,
};
const midValue: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontWeight: 700,
  fontSize: 14,
  lineHeight: 1,
};
const valueWord: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.1em',
  color: 'var(--mut)',
};
const deltaLine: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.06em',
  color: 'var(--dim)',
  marginTop: 3,
};
