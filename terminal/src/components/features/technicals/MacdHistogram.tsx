import { Panel, PanelHeader, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { IndicatorData } from '@/lib/features/indicators';
import { fmtZ } from '@/lib/format';
import { signTone, toneVar } from '@/lib/theme/tokens';

export interface MacdHistogramProps {
  indicators: Envelope<IndicatorData>;
}

const W = 800;
const H = 150;
const PAD = 10;

export function MacdHistogram({ indicators }: MacdHistogramProps) {
  const { macd, macdSignal } = indicators.data;
  const hist = macd - macdSignal;

  const bars = [
    { key: 'MACD', v: macd },
    { key: 'SIGNAL', v: macdSignal },
    { key: 'HIST', v: hist },
  ];
  const max = Math.max(...bars.map((b) => Math.abs(b.v)), 1e-6);
  const zeroY = H / 2;
  const slot = (W - PAD * 2) / bars.length;
  const barW = slot * 0.4;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="MACD"
        note={hist >= 0 ? 'MOMENTUM UP' : 'MOMENTUM DOWN'}
        right={<MockBadge env={indicators} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '150px', display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          <line
            x1={PAD}
            x2={W - PAD}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--line2)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {bars.map((b, i) => {
            const cx = PAD + (i + 0.5) * slot;
            const h = (Math.abs(b.v) / max) * (H / 2 - PAD);
            const yTop = b.v >= 0 ? zeroY - h : zeroY;
            return (
              <rect
                key={b.key}
                x={cx - barW / 2}
                y={yTop}
                width={barW}
                height={Math.max(1, h)}
                fill={toneVar(signTone(b.v))}
              />
            );
          })}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <KeyValueRow label="MACD LINE" value={fmtZ(macd)} tone={signTone(macd)} />
          <KeyValueRow label="SIGNAL LINE" value={fmtZ(macdSignal)} tone={signTone(macdSignal)} />
          <KeyValueRow label="HISTOGRAM" value={fmtZ(hist)} tone={signTone(hist)} />
        </div>
      </div>
      <SourceFootnote env={indicators} />
    </Panel>
  );
}
