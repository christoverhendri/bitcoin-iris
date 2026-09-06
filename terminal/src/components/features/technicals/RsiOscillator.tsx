import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { IndicatorData } from '@/lib/features/indicators';
import { toIndicatorLabels } from '@/lib/features/indicators/present';
import { type Tone, toneVar } from '@/lib/theme/tokens';

export interface RsiOscillatorProps {
  indicators: Envelope<IndicatorData>;
}

const W = 800;
const H = 64;

function rsiTone(v: number): Tone {
  if (v > 70) return 'up';
  if (v < 30) return 'down';
  return 'txt';
}

export function RsiOscillator({ indicators }: RsiOscillatorProps) {
  const rsi = indicators.data.rsi;
  const labels = toIndicatorLabels(indicators.data);
  const tone = rsiTone(rsi);
  const markX = (Math.max(0, Math.min(100, rsi)) / 100) * W;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="RSI (14)"
        note={rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'}
        right={<MockBadge env={indicators} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            fontSize: 22,
            color: toneVar(tone),
          }}
        >
          {labels.rsi}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '64px', display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          <rect x={0} y={0} width={(30 / 100) * W} height={H} fill="var(--down)" opacity={0.12} />
          <rect x={(70 / 100) * W} y={0} width={(30 / 100) * W} height={H} fill="var(--up)" opacity={0.12} />
          {[30, 50, 70].map((lvl) => (
            <line
              key={lvl}
              x1={(lvl / 100) * W}
              x2={(lvl / 100) * W}
              y1={0}
              y2={H}
              stroke="var(--line2)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={markX}
            x2={markX}
            y1={0}
            y2={H}
            stroke={toneVar(tone)}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={markX} cy={H / 2} r={3} fill={toneVar(tone)} />
        </svg>
        <div
          className="iris-micro"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'var(--dim)',
          }}
        >
          <span>0</span>
          <span>30</span>
          <span>50</span>
          <span>70</span>
          <span>100</span>
        </div>
      </div>
      <SourceFootnote env={indicators} />
    </Panel>
  );
}
