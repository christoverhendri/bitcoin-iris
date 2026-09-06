import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { VolatilityData } from '@/lib/features/volatility';
import { fmtPct } from '@/lib/format';
import { volAtTenor } from './volModel';

export interface VolHistoryChartProps {
  volatility: Envelope<VolatilityData>;
}

const W = 800;
const H = 180;
const PAD = 12;
const TENORS = [7, 14, 30, 60, 90, 180, 365];
const TENOR_LABELS = ['1W', '2W', '1M', '2M', '3M', '6M', '1Y'];

export function VolHistoryChart({ volatility }: VolHistoryChartProps) {
  const v = volatility.data;
  const points = TENORS.map((d) => volAtTenor(v, d));
  const hi = Math.max(...points);
  const lo = Math.min(...points);
  const span = hi - lo || 1;

  const x = (i: number) => PAD + (i / (TENORS.length - 1)) * (W - PAD * 2);
  const y = (val: number) => H - PAD - ((val - lo) / span) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p)}`).join(' ');

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="VOLATILITY TERM CURVE"
        note="MODELLED FROM 30D/90D"
        right={<MockBadge env={volatility} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '180px', display: 'block', background: 'var(--sunk)' }}
          shapeRendering="geometricPrecision"
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
          <path d={path} fill="none" stroke="var(--amber)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p)} r={2} fill="var(--amber)" />
          ))}
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
          {TENOR_LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)' }}
        >
          RANGE {fmtPct(lo, false)} — {fmtPct(hi, false)}
        </div>
      </div>
      <SourceFootnote env={volatility} />
    </Panel>
  );
}
