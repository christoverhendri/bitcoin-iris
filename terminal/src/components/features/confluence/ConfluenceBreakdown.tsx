import { Panel, PanelHeader, ProgressBar, DivergingBar, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ConfluenceData } from '@/lib/features/confluence';
import type { ConfluenceLayer } from '@/lib/features/confluence/types';
import { toConfluenceLabels, LAYER_DESCRIPTIONS } from '@/lib/features/confluence/present';
import type { Tone } from '@/lib/theme/tokens';

export interface ConfluenceBreakdownProps {
  confluence: Envelope<ConfluenceData>;
}

function scoreTone(score: number): Tone {
  if (score > 75) return 'up';
  if (score < 45) return 'down';
  return 'txt';
}

const LAYER_ORDER: ConfluenceLayer[] = ['MACRO', 'ONCHAIN', 'SENTIMENT', 'TECHNICAL', 'NEWS'];

export function ConfluenceBreakdown({ confluence }: ConfluenceBreakdownProps) {
  const c = confluence.data;
  const L = toConfluenceLabels(c);
  const overallTone = scoreTone(c.scores.overall);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <Panel style={{ display: 'flex', flexDirection: 'column' }}>
        <PanelHeader
          title="CONFLUENCE SCORE"
          note="INTERNAL COMPOSITE — ARBITRARY WEIGHTS"
          right={<MockBadge env={confluence} />}
        />
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 44,
                lineHeight: 1,
                color: `var(--${overallTone})`,
              }}
            >
              {L.overall}
            </span>
            <span className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)' }}>
              / 100
            </span>
          </div>
          <ProgressBar pct={c.scores.overall} tone={overallTone} height={6} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--mut)' }}>
                BULLISH
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--up)' }}>{L.bullish}</div>
            </div>
            <div>
              <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--mut)' }}>
                BEARISH
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--down)' }}>{L.bearish}</div>
            </div>
          </div>
          <DivergingBar value={c.scores.bullish - c.scores.bearish} max={50} height={6} />
        </div>
        <SourceFootnote env={confluence} />
      </Panel>

      <Panel style={{ display: 'flex', flexDirection: 'column' }}>
        <PanelHeader
          title="LAYER BREAKDOWN"
          note="5 EVIDENCE LAYERS · EQUAL-WEIGHT MEAN"
          right={<MockBadge env={confluence} />}
        />
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {LAYER_ORDER.map((layer) => {
            const v = c.layers[layer];
            const tone = scoreTone(v);
            return (
              <div key={layer} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span
                    className="iris-micro"
                    style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.12em', color: 'var(--txt)' }}
                  >
                    {layer}
                  </span>
                  <span
                    className="iris-micro"
                    style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: `var(--${tone})` }}
                  >
                    {v.toFixed(1)}
                  </span>
                </div>
                <ProgressBar pct={v} tone={tone} height={4} />
                <span
                  className="iris-micro"
                  style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--dim)', letterSpacing: '.04em' }}
                >
                  {LAYER_DESCRIPTIONS[layer]}
                </span>
              </div>
            );
          })}
        </div>
        <SourceFootnote env={confluence} />
      </Panel>
    </div>
  );
}
