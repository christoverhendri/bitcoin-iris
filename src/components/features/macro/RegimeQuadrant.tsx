import {
  Panel,
  PanelHeader,
  KpiCard,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMetric } from '@/lib/features/macroCountry';
import type { Tone } from '@/lib/theme/tokens';
import { zWords } from '@/lib/zWords';

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

/**
 * Blurbs are relative on purpose: each axis is "vs its own last 2 years", so
 * DEFLATION here means growth AND inflation are both below their usual level —
 * not that prices are falling.
 */
function classifyRegime(growthZ: number, inflationZ: number): Regime {
  if (growthZ >= 0 && inflationZ < 0)
    return { label: 'GOLDILOCKS', tone: 'up', blurb: 'Pertumbuhan di atas biasanya, inflasi di bawah biasanya' };
  if (growthZ >= 0 && inflationZ >= 0)
    return { label: 'REFLATION', tone: 'amber', blurb: 'Pertumbuhan dan inflasi sama-sama di atas biasanya' };
  if (growthZ < 0 && inflationZ >= 0)
    return { label: 'STAGFLATION', tone: 'down', blurb: 'Pertumbuhan di bawah biasanya, inflasi di atas biasanya' };
  return {
    label: 'DEFLATION',
    tone: 'blue',
    blurb: 'Pertumbuhan dan inflasi sama-sama di bawah biasanya (bukan berarti harga turun)',
  };
}

// SVG frame
const S = 200;
const PAD = 22;
const AXIS_MAX = 3; // 3 standard deviations map to the plot edges (not shown as a number)

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
  const quadrant = classifyRegime(gz, iz);
  // Both readings within ±1 of their usual: the quadrant label would claim a
  // phase the words below contradict ("DEFLATION" next to "sekitar biasanya").
  const nearNormal = Math.abs(gz) < 1 && Math.abs(iz) < 1;
  const regime: Regime = nearNormal
    ? {
        label: 'NORMAL',
        tone: 'txt',
        blurb: `Pertumbuhan dan inflasi sama-sama dekat kebiasaannya; sedikit condong ke ${quadrant.label}`,
      }
    : quadrant;

  const px = coord(gz, 'x');
  const py = coord(iz, 'y');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Fase ekonomi AS dilihat dari dua hal: pertumbuhan ekonomi dan inflasi inti, masing-masing
        dibandingkan dengan kebiasaannya selama 2 tahun terakhir. Labelnya menggambarkan arah relatif,
        bukan kondisi mutlak — mis. &quot;DEFLATION&quot; berarti keduanya lebih rendah dari biasanya,
        bukan harga sedang turun. Kalau keduanya masih dekat kebiasaannya, labelnya NORMAL.
      </p>
      <Panel style={{ display: 'flex', flexDirection: 'column' }}>
        <KpiCard
          label="FASE EKONOMI"
          value={regime.label}
          tone={regime.tone}
          detail={regime.blurb}
          right={<MockBadge env={macro} />}
        />
        <SourceFootnote env={macro} />
      </Panel>

      <Panel style={{ display: 'flex', flexDirection: 'column' }}>
        <PanelHeader title="REGIME QUADRANT" note={`${countryLabel} · PERTUMBUHAN × INFLASI, DIBANDING 2 TAHUN TERAKHIR`} right={<MockBadge env={macro} />} />
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
                fill={q.label === quadrant.label ? `var(--${quadrant.tone})` : 'var(--dim)'}
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
            <line x1={S / 2} y1={S / 2} x2={px.toFixed(2)} y2={py.toFixed(2)} stroke={`var(--${quadrant.tone})`} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            <circle cx={px.toFixed(2)} cy={py.toFixed(2)} r="4" fill={`var(--${quadrant.tone})`} />
          </svg>
        </div>

        {/* the two readings in words — no z numbers */}
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
          <div>
            <span style={{ color: 'var(--mut)' }}>Pertumbuhan ekonomi: </span>
            {zWords(gz, '2 tahun terakhir')}
          </div>
          <div>
            <span style={{ color: 'var(--mut)' }}>Inflasi inti: </span>
            {zWords(iz, '2 tahun terakhir')}
          </div>
        </div>
        <SourceFootnote env={macro} />
      </Panel>
    </div>
  );
}
