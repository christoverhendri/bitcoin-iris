import {
  Panel,
  PanelGrid,
  PanelHeader,
  KpiCard,
  DivergingBar,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMetric } from '@/lib/features/macroCountry';
import type { Tone } from '@/lib/theme/tokens';
import { fmtZ } from '@/lib/format';

export interface RegimeQuadrantProps {
  macro: Envelope<MacroMetric[]>;
  country: string;
  countryLabel: string;
}

interface Regime {
  label: string;
  tone: Tone;
  blurb: string;
}

function classifyRegime(growthZ: number, inflationZ: number): Regime {
  if (growthZ >= 0 && inflationZ < 0)
    return { label: 'GOLDILOCKS', tone: 'up', blurb: 'Growth firming, inflation easing' };
  if (growthZ >= 0 && inflationZ >= 0)
    return { label: 'REFLATION', tone: 'amber', blurb: 'Growth and inflation both rising' };
  if (growthZ < 0 && inflationZ >= 0)
    return { label: 'STAGFLATION', tone: 'down', blurb: 'Growth slowing, inflation sticky' };
  return { label: 'DEFLATION', tone: 'blue', blurb: 'Growth and inflation both falling' };
}

// SVG frame
const S = 200;
const PAD = 22;
const AXIS_MAX = 3; // ±3σ maps to the plot edges

function coord(z: number, axis: 'x' | 'y'): number {
  const frac = Math.max(-1, Math.min(1, z / AXIS_MAX));
  const span = (S - PAD * 2) / 2;
  return axis === 'x' ? S / 2 + frac * span : S / 2 - frac * span;
}

const QUADRANTS: { x: number; y: number; label: string }[] = [
  { x: S - PAD, y: PAD + 4, label: 'REFLATION' },
  { x: PAD, y: PAD + 4, label: 'STAGFLATION' },
  { x: PAD, y: S - PAD, label: 'DEFLATION' },
  { x: S - PAD, y: S - PAD, label: 'GOLDILOCKS' },
];

export function RegimeQuadrant({ macro, country, countryLabel }: RegimeQuadrantProps) {
  const m = macro.data.find((x) => x.country === country) ?? macro.data[0];
  const gz = m.zScores.growth;
  const iz = m.zScores.inflation;
  const regime = classifyRegime(gz, iz);
  const composite = (gz - iz) / 2; // pro-growth minus inflation impulse

  const px = coord(gz, 'x');
  const py = coord(iz, 'y');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <PanelGrid columns="repeat(auto-fit, minmax(220px, 1fr))">
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="MACRO REGIME"
            value={regime.label}
            tone={regime.tone}
            detail={regime.blurb}
            right={<MockBadge env={macro} />}
          />
          <SourceFootnote env={macro} />
        </div>
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="COMPOSITE IMPULSE"
            value={fmtZ(composite)}
            tone={composite > 0.25 ? 'up' : composite < -0.25 ? 'down' : 'txt'}
            detail="(growth z − inflation z) / 2"
            pct={Math.min(100, Math.abs(composite / AXIS_MAX) * 100)}
            right={<MockBadge env={macro} />}
          />
          <SourceFootnote env={macro} />
        </div>
      </PanelGrid>

      <Panel style={{ display: 'flex', flexDirection: 'column' }}>
        <PanelHeader title="REGIME QUADRANT" note={`${countryLabel} · GROWTH × INFLATION (z)`} right={<MockBadge env={macro} />} />
        <div style={{ padding: 14, display: 'flex', justifyContent: 'center' }}>
          <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 340 }} aria-hidden="true">
            {/* plot border */}
            <rect
              x={PAD}
              y={PAD}
              width={S - PAD * 2}
              height={S - PAD * 2}
              fill="none"
              stroke="var(--line2)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {/* zero axes */}
            <line x1={S / 2} y1={PAD} x2={S / 2} y2={S - PAD} stroke="var(--line2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1={PAD} y1={S / 2} x2={S - PAD} y2={S / 2} stroke="var(--line2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />

            {/* quadrant labels */}
            {QUADRANTS.map((q) => (
              <text
                key={q.label}
                x={q.x}
                y={q.y}
                textAnchor={q.x < S / 2 ? 'start' : 'end'}
                fill={q.label === regime.label ? `var(--${regime.tone})` : 'var(--dim)'}
                fontSize="7.5"
                fontFamily="var(--mono)"
                letterSpacing="1"
              >
                {q.label}
              </text>
            ))}

            {/* axis captions */}
            <text x={S - PAD} y={S / 2 - 4} textAnchor="end" fill="var(--mut)" fontSize="7" fontFamily="var(--mono)">
              GROWTH +
            </text>
            <text x={S / 2 + 4} y={PAD + 8} fill="var(--mut)" fontSize="7" fontFamily="var(--mono)">
              INFLATION +
            </text>

            {/* current position */}
            <line x1={S / 2} y1={S / 2} x2={px.toFixed(2)} y2={py.toFixed(2)} stroke={`var(--${regime.tone})`} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            <circle cx={px.toFixed(2)} cy={py.toFixed(2)} r="4" fill={`var(--${regime.tone})`} />
          </svg>
        </div>

        {/* z drivers */}
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'GROWTH Z', z: gz },
            { label: 'INFLATION Z', z: iz },
          ].map((x) => (
            <div key={x.label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 46px', gap: 10, alignItems: 'center' }}>
              <span
                className="iris-micro"
                style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)', letterSpacing: '.06em' }}
              >
                {x.label}
              </span>
              <DivergingBar value={x.z} max={AXIS_MAX} />
              <span
                className="iris-micro"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  fontWeight: 700,
                  textAlign: 'right',
                  color: `var(--${x.z > 0 ? 'up' : x.z < 0 ? 'down' : 'txt'})`,
                }}
              >
                {fmtZ(x.z)}
              </span>
            </div>
          ))}
        </div>
        <SourceFootnote env={macro} />
      </Panel>
    </div>
  );
}
