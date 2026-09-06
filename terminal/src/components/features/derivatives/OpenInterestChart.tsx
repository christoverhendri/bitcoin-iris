import { MockBadge, Panel, PanelHeader, SourceFootnote, Tag } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import { toDerivativesLabels, type DerivativesData } from '@/lib/features/derivatives';
import { signTone } from '@/lib/theme/tokens';

const W = 800;
const H = 160;
const PAD = 12;

export function OpenInterestChart({ derivatives }: { derivatives: Envelope<DerivativesData> }) {
  const d = derivatives.data;
  const L = toDerivativesLabels(d);
  const pts = d.oiHistory;

  const values = pts.map((p) => p.oi);
  const hi = values.length ? Math.max(...values) : 1;
  const lo = values.length ? Math.min(...values) : 0;
  const span = hi - lo || 1;

  const x = (i: number) => PAD + (pts.length < 2 ? 0 : (i / (pts.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.oi)}`).join(' ');

  return (
    <Panel>
      <PanelHeader
        title="OPEN INTEREST"
        note="BYBIT BTCUSDT PERP · 48H"
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
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 22, color: 'var(--txt)' }}>
          {L.openInterestBtc}
        </span>
        <span className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)' }}>
          ≈ {L.openInterestUsd}
        </span>
        <Tag label={`${L.oiChange24h} 24H`} tone={signTone(d.oiChange24hPct)} />
      </div>

      <div style={{ padding: 12 }}>
        {pts.length >= 2 ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: 160, display: 'block', background: 'var(--sunk)' }}
            shapeRendering="crispEdges"
          >
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1={PAD}
                x2={W - PAD}
                y1={PAD + t * (H - PAD * 2)}
                y2={PAD + t * (H - PAD * 2)}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={path}
              fill="none"
              stroke="var(--blue)"
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
            NO OPEN-INTEREST HISTORY RETURNED
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
          <span>-48H</span>
          <span>
            RANGE {Math.round(lo).toLocaleString('en-US')} — {Math.round(hi).toLocaleString('en-US')} BTC
          </span>
          <span>NOW</span>
        </div>
      </div>

      <SourceFootnote env={derivatives} />
    </Panel>
  );
}
