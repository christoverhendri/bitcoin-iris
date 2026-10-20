import { softCase } from '@/lib/softCase';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import {
  BUCKETS,
  BUCKET_LABEL,
  fmtShare,
  netTilt,
  type SocialSentimentData,
  type SocialSentimentDay,
} from '@/lib/features/socialSentiment';

/**
 * BTC social sentiment from Santiment: what share of posts on Twitter, Reddit,
 * Telegram and 4chan its classifier labels positive / neutral / negative.
 * Shown as the net tilt (positive minus negative), its daily line, and the
 * three shares written out, so colour is never the only carrier.
 */

function lagNote(d: SocialSentimentData) {
  return `DATA AS OF ${d.latest.date} · ${d.lagDays} DAYS BEHIND`;
}

/** Net tilt per day, as an SVG path over `w x h` (positive up). */
function tiltPath(history: SocialSentimentDay[], w: number, h: number) {
  const vals = history.map((d) => netTilt(d));
  const m = Math.max(5, ...vals.map((v) => Math.abs(v)));
  const pts = vals.map((v, i) => [vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2, h / 2 - (v / m) * (h / 2 - 4)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return { line, area: pts.length ? `${line} L${w} ${h / 2} L0 ${h / 2} Z` : '' };
}

/** Compact card for the Overview row: the net tilt, its 30-day line and the three shares. */
export function SocialSentimentCard({ social }: { social: Envelope<SocialSentimentData> }) {
  const d = social.data;
  const tilt = netTilt(d.latest);
  const { line, area } = tiltPath(d.history, 300, 80);
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Social sentiment" note={`${d.history.length} days`} right={<MockBadge env={social} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="t-display" style={{ fontSize: 48 }}>
            {tilt >= 0 ? '+' : '−'}
            {Math.abs(tilt).toFixed(1)}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: tilt >= 0 ? '#ffb27a' : 'var(--down)' }}>
            {tilt >= 0 ? 'Leaning positive' : 'Leaning negative'}
          </span>
        </div>
        {d.history.length > 1 ? (
          <svg width="100%" height={100} viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={`Net social tilt over ${d.history.length} days, now ${tilt.toFixed(1)} points`}>
            <path d="M0 40 L300 40" stroke="var(--line2)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            <path d={area} fill="var(--accent)" fillOpacity={0.15} />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        ) : null}
        <div style={{ display: 'flex', gap: 10 }}>
          {BUCKETS.map((b) => (
            <div key={b} className="iris-inset" style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{softCase(BUCKET_LABEL[b])}</span>
              <span style={{ fontSize: 19, fontWeight: 600 }}>{fmtShare(d.latest[b])}</span>
            </div>
          ))}
        </div>
        <span className="t-caption" title={lagNote(d)}>
          Santiment · {d.sources.join(', ')} · {d.lagDays} days behind
        </span>
      </div>
      <SourceFootnote env={social} />
    </Panel>
  );
}
