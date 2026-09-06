import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { FearGreedData } from '@/lib/features/fearGreed';
import { toFearGreedLabel } from '@/lib/features/fearGreed/present';
import { fmtPct } from '@/lib/format';

export interface FearGreedGaugeProps {
  fearGreed: Envelope<FearGreedData>;
}

const CX = 100;
const CY = 100;
const R = 78;

/** value 0..100 -> point on the upper semicircle (v=0 left, v=100 right). */
function pt(v: number): [number, number] {
  const ang = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100);
  return [CX + R * Math.cos(ang), CY - R * Math.sin(ang)];
}

/** A zone of the arc rendered as a straight-segment polyline (no arc-flag ambiguity). */
function arcPoints(v1: number, v2: number, steps = 20): string {
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = pt(v1 + ((v2 - v1) * i) / steps);
    out.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return out.join(' ');
}

const ZONES: { from: number; to: number; color: string; opacity: number }[] = [
  { from: 0, to: 20, color: 'var(--down)', opacity: 1 },
  { from: 20, to: 40, color: 'var(--down)', opacity: 0.5 },
  { from: 40, to: 60, color: 'var(--amber)', opacity: 0.9 },
  { from: 60, to: 80, color: 'var(--up)', opacity: 0.5 },
  { from: 80, to: 100, color: 'var(--up)', opacity: 1 },
];

export function FearGreedGauge({ fearGreed }: FearGreedGaugeProps) {
  const fg = fearGreed.data;
  const { label, color } = toFearGreedLabel(fg);
  const [nx, ny] = pt(fg.value);
  const changeTone = fg.changePct > 0 ? 'var(--up)' : fg.changePct < 0 ? 'var(--down)' : 'var(--mut)';

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 240 }}>
      <PanelHeader title="FEAR & GREED" note="0-100 INDEX" right={<MockBadge env={fearGreed} />} />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 12px',
        }}
      >
        <svg viewBox="0 0 200 118" style={{ width: '100%', maxWidth: 280 }} aria-hidden="true">
          {/* track */}
          <polyline
            points={arcPoints(0, 100, 60)}
            fill="none"
            stroke="var(--line2)"
            strokeWidth="6"
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
          {/* coloured zones */}
          {ZONES.map((z) => (
            <polyline
              key={z.from}
              points={arcPoints(z.from + 0.8, z.to - 0.8)}
              fill="none"
              stroke={z.color}
              strokeOpacity={z.opacity}
              strokeWidth="6"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* ticks */}
          {[0, 25, 50, 75, 100].map((v) => {
            const a = Math.PI * (1 - v / 100);
            return (
              <line
                key={v}
                x1={(CX + (R - 7) * Math.cos(a)).toFixed(2)}
                y1={(CY - (R - 7) * Math.sin(a)).toFixed(2)}
                x2={(CX + (R + 6) * Math.cos(a)).toFixed(2)}
                y2={(CY - (R + 6) * Math.sin(a)).toFixed(2)}
                stroke="var(--dim)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {/* needle */}
          <line
            x1={CX}
            y1={CY}
            x2={nx.toFixed(2)}
            y2={ny.toFixed(2)}
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={CX} cy={CY} r="3" fill={color} />
          <circle cx={nx.toFixed(2)} cy={ny.toFixed(2)} r="3.2" fill={color} />

          {/* end labels */}
          <text x="6" y="114" fill="var(--dim)" fontSize="8" fontFamily="var(--mono)" letterSpacing="1.4">
            FEAR
          </text>
          <text
            x="194"
            y="114"
            textAnchor="end"
            fill="var(--dim)"
            fontSize="8"
            fontFamily="var(--mono)"
            letterSpacing="1.4"
          >
            GREED
          </text>
        </svg>

        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34, color, lineHeight: 1 }}>
            {fg.value}
          </div>
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.16em', color, marginTop: 4 }}
          >
            {label.toUpperCase()}
          </div>
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, color: changeTone, marginTop: 3 }}
          >
            {fmtPct(fg.changePct, true)} vs prev
          </div>
        </div>
      </div>

      <SourceFootnote env={fearGreed} />
    </Panel>
  );
}
