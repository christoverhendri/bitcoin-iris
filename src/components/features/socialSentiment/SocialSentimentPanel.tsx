import type { CSSProperties } from 'react';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import {
  BUCKETS,
  BUCKET_COLOR,
  BUCKET_LABEL,
  donutArcs,
  fmtShare,
  netTilt,
  type SocialSentimentData,
  type SocialSentimentDay,
} from '@/lib/features/socialSentiment';

/**
 * BTC social sentiment from Santiment: what share of posts on Twitter, Reddit,
 * Telegram and 4chan its classifier labels positive / neutral / negative.
 *
 * Two marks, two jobs:
 *   - a donut for the newest day — part-to-whole at a glance, three slices.
 *     (The 30-day diverging bar chart was removed in the 2026-10-18 curation.)
 *
 * Every slice and column carries a text label or a tooltip; colour is never the
 * only way to tell positive from negative.
 */

const mono: CSSProperties = { fontFamily: 'var(--mono)' };

function Donut({ day, size }: { day: SocialSentimentDay; size: number }) {
  const r = size / 2;
  const arcs = donutArcs(day, r, r, r - 1, r * 0.62);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${fmtShare(day[b])}`).join(', ')}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {arcs.map((a) => (
        <path key={a.bucket} d={a.d} fill={BUCKET_COLOR[a.bucket]}>
          <title>{`${BUCKET_LABEL[a.bucket]} ${fmtShare(a.share)} · ${day.date}`}</title>
        </path>
      ))}
    </svg>
  );
}

function Legend({ day, dense }: { day: SocialSentimentDay; dense?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: dense ? 2 : 6, minWidth: 0 }}>
      {BUCKETS.map((b) => (
        <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_COLOR[b], flexShrink: 0 }} />
          <span style={{ ...mono, fontSize: dense ? 9 : 10, color: 'var(--mut)', letterSpacing: '.1em', minWidth: 62 }}>
            {BUCKET_LABEL[b]}
          </span>
          <span style={{ ...mono, fontSize: dense ? 11 : 13, fontWeight: 700, color: 'var(--txt)' }}>
            {fmtShare(day[b])}
          </span>
        </div>
      ))}
    </div>
  );
}

function lagNote(d: SocialSentimentData) {
  return `DATA AS OF ${d.latest.date} · ${d.lagDays} DAYS BEHIND`;
}

/** Full panel for the Sentiment page. */
export function SocialSentimentPanel({ social }: { social: Envelope<SocialSentimentData> }) {
  const d = social.data;
  const tilt = netTilt(d.latest);
  return (
    <Panel>
      <PanelHeader
        title="SOCIAL SENTIMENT · BTC"
        note={`Santiment · ${d.sources.join(', ')}`}
        right={<MockBadge env={social} />}
      />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Donut day={d.latest} size={124} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <Legend day={d.latest} />
            <div style={{ ...mono, fontSize: 10, color: 'var(--mut)' }}>
              {tilt >= 0 ? '+' : ''}
              {tilt.toFixed(1)} pts more {tilt >= 0 ? 'positive than negative' : 'negative than positive'}
            </div>
          </div>
        </div>

        <p style={{ margin: 0, ...mono, fontSize: 8.5, lineHeight: 1.55, color: 'var(--dim)' }}>
          {lagNote(d)}. Share of BTC posts each day that Santiment&apos;s classifier labels positive,
          neutral or negative (counts per label ÷ all labelled posts). Santiment&apos;s free plan
          withholds the latest 30 days, so this reads a month back, not today. Fetched daily by
          the worker.
        </p>
      </div>
      <SourceFootnote env={social} />
    </Panel>
  );
}

/** Compact card for the Overview strip. */
export function SocialSentimentCard({ social }: { social: Envelope<SocialSentimentData> }) {
  const d = social.data;
  return (
    <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 14px', minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="iris-micro" style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}>
            SOCIAL SENTIMENT
          </span>
          <MockBadge env={social} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Donut day={d.latest} size={58} />
          <Legend day={d.latest} dense />
        </div>
        <div className="iris-micro" style={{ ...mono, fontSize: 9, color: 'var(--dim)', marginTop: 6 }}>
          Santiment · {lagNote(d).toLowerCase()}
        </div>
      </div>
      <SourceFootnote env={social} />
    </div>
  );
}
