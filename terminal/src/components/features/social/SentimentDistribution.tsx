import { Panel, PanelGrid, PanelHeader, DivergingBar, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SentimentData } from '@/lib/features/sentiment';
import { toSentimentLabels } from '@/lib/features/sentiment/present';
import { signTone } from '@/lib/theme/tokens';

export interface SentimentDistributionProps {
  sentiment: Envelope<SentimentData>;
}

export function SentimentDistribution({ sentiment }: SentimentDistributionProps) {
  const s = sentiment.data;
  const labels = toSentimentLabels(s);

  // Raw pct values are not guaranteed to sum to 100 — normalise for bar widths only.
  const total = s.positivePct + s.neutralPct + s.negativePct || 1;
  const seg = [
    { key: 'BULLISH', frac: s.positivePct / total, label: labels.positive, color: 'var(--up)' },
    { key: 'NEUTRAL', frac: s.neutralPct / total, label: labels.neutral, color: 'var(--mut)' },
    { key: 'BEARISH', frac: s.negativePct / total, label: labels.negative, color: 'var(--down)' },
  ];

  return (
    <PanelGrid columns="repeat(auto-fit, minmax(260px, 1fr))">
      <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
        <PanelHeader title="SENTIMENT DISTRIBUTION" note="SOCIAL MENTIONS" right={<MockBadge env={sentiment} />} />
        <div style={{ padding: '14px 12px', flex: 1 }}>
          {/* stacked bar */}
          <div style={{ display: 'flex', height: 10, border: '1px solid var(--line2)', background: 'var(--sunk)' }}>
            {seg.map((x) => (
              <div key={x.key} style={{ width: `${(x.frac * 100).toFixed(2)}%`, background: x.color }} />
            ))}
          </div>
          {/* legend */}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seg.map((x) => (
              <div
                key={x.key}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, background: x.color, display: 'inline-block' }} />
                  <span
                    className="iris-micro"
                    style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.12em', color: 'var(--mut)' }}
                  >
                    {x.key}
                  </span>
                </span>
                <span
                  className="iris-micro"
                  style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: x.color }}
                >
                  {x.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <SourceFootnote env={sentiment} />
      </Panel>

      <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
        <PanelHeader title="SENTIMENT SCORE" note="-1.00 .. +1.00" right={<MockBadge env={sentiment} />} />
        <div
          style={{
            padding: '16px 14px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 30,
              lineHeight: 1,
              color: `var(--${signTone(s.score)})`,
            }}
          >
            {labels.score}
          </div>
          <DivergingBar value={s.score} max={1} height={8} />
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--dim)' }}
          >
            {s.score > 0.1 ? 'NET BULLISH TONE' : s.score < -0.1 ? 'NET BEARISH TONE' : 'BALANCED TONE'}
          </div>
        </div>
        <SourceFootnote env={sentiment} />
      </Panel>
    </PanelGrid>
  );
}
