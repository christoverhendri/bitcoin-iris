import { MockBadge, Panel, PanelHeader, SourceFootnote, Tag } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import { DVOL_NOTE, toDerivativesLabels, type DerivativesData } from '@/lib/features/derivatives';
import { signTone } from '@/lib/theme/tokens';

const W = 400;
const H = 70;
const PAD = 6;

export function DvolPanel({ derivatives }: { derivatives: Envelope<DerivativesData> }) {
  const d = derivatives.data;
  const L = toDerivativesLabels(d);
  const pts = d.dvolHistory;

  const values = pts.map((p) => p.close);
  const hi = values.length ? Math.max(...values) : 1;
  const lo = values.length ? Math.min(...values) : 0;
  const span = hi - lo || 1;

  const x = (i: number) => PAD + (pts.length < 2 ? 0 : (i / (pts.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.close)}`).join(' ');

  return (
    <Panel>
      <PanelHeader
        title="DVOL"
        note="DERIBIT IMPLIED VOL · 30D"
        right={<MockBadge env={derivatives} />}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          padding: '13px 12px',
          borderBottom: '1px solid var(--line)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 26, color: 'var(--purple)' }}>
          {L.dvol}
        </span>
        <Tag label={`${L.dvolChange7d} 7D`} tone={signTone(d.dvolChange7dPct)} />
      </div>

      <div style={{ padding: 12 }}>
        {pts.length >= 2 ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: 70, display: 'block', background: 'var(--sunk)' }}
            shapeRendering="crispEdges"
          >
            <path
              d={path}
              fill="none"
              stroke="var(--purple)"
              strokeWidth="1"
              strokeLinecap="butt"
              strokeLinejoin="miter"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}
          >
            NO DVOL HISTORY RETURNED
          </div>
        )}
        <div
          className="iris-micro"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            color: 'var(--dim)',
            marginTop: 6,
          }}
        >
          <span>-7D</span>
          <span>
            {lo.toFixed(1)} — {hi.toFixed(1)}
          </span>
          <span>NOW</span>
        </div>
      </div>

      <div
        className="iris-micro"
        style={{
          padding: '9px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 9,
          lineHeight: 1.55,
          color: 'var(--dim)',
        }}
      >
        {DVOL_NOTE}
      </div>

      <SourceFootnote env={derivatives} />
    </Panel>
  );
}
