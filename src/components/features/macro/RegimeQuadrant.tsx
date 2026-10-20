import { Panel, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMetric } from '@/lib/features/macroCountry';
import { zWords } from '@/lib/zWords';

export interface RegimeQuadrantProps {
  macro: Envelope<MacroMetric[]>;
  country: string;
  countryLabel: string;
}

type RegimeName = 'GOLDILOCKS' | 'REFLATION' | 'STAGFLATION' | 'DEFLATION';

interface Regime {
  label: string;
  quadrant: RegimeName;
  blurb: string;
}

/**
 * Blurbs are relative on purpose: each axis is "vs its own last 2 years", so
 * DEFLATION here means growth AND inflation are both below their usual level —
 * not that prices are falling.
 */
function classifyRegime(growthZ: number, inflationZ: number): Regime {
  if (growthZ >= 0 && inflationZ < 0)
    return { label: 'Goldilocks', quadrant: 'GOLDILOCKS', blurb: 'Pertumbuhan di atas biasanya, inflasi di bawah biasanya.' };
  if (growthZ >= 0 && inflationZ >= 0)
    return { label: 'Reflation', quadrant: 'REFLATION', blurb: 'Pertumbuhan dan inflasi sama-sama di atas biasanya.' };
  if (growthZ < 0 && inflationZ >= 0)
    return { label: 'Stagflation', quadrant: 'STAGFLATION', blurb: 'Pertumbuhan di bawah biasanya, inflasi di atas biasanya.' };
  return {
    label: 'Deflation',
    quadrant: 'DEFLATION',
    blurb: 'Pertumbuhan dan inflasi sama-sama di bawah biasanya (bukan berarti harga turun).',
  };
}

/** 3 standard deviations reach the edge of the plot (not shown as a number). */
const AXIS_MAX = 3;
const toPct = (z: number) => 50 + Math.max(-1, Math.min(1, z / AXIS_MAX)) * 44;

/** Top row is inflation above usual; right column is growth above usual. */
const CELLS: { name: RegimeName; label: string; align: string; justify: string; radius: string }[] = [
  { name: 'STAGFLATION', label: 'Stagflation', align: 'flex-start', justify: 'flex-start', radius: '22px 6px 6px 6px' },
  { name: 'REFLATION', label: 'Reflation', align: 'flex-end', justify: 'flex-start', radius: '6px 22px 6px 6px' },
  { name: 'DEFLATION', label: 'Deflation', align: 'flex-start', justify: 'flex-end', radius: '6px 6px 6px 22px' },
  { name: 'GOLDILOCKS', label: 'Goldilocks', align: 'flex-end', justify: 'flex-end', radius: '6px 6px 22px 6px' },
];

function ScoreBar({ label, z }: { label: string; z: number }) {
  const w = Math.min(50, (Math.abs(z) / AXIS_MAX) * 50);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: z >= 0 ? '#ffb27a' : 'var(--down)' }}>{z >= 0 ? 'di atas biasanya' : 'di bawah biasanya'}</span>
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'var(--line)' }}>
        <span style={{ position: 'absolute', left: '50%', top: -4, bottom: -4, width: 2, background: '#3a2b20' }} />
        <div
          className="ember-grow"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            borderRadius: 999,
            background: z >= 0 ? 'var(--accent)' : '#8a5e40',
            ...(z >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%`, transformOrigin: 'right center' }),
          }}
        />
      </div>
      <span style={{ fontSize: 13, color: 'var(--dim)' }}>{zWords(z, '2 tahun terakhir')}</span>
    </div>
  );
}

/**
 * The US macro phase: growth and core inflation, each against its own last two
 * years (FRED). The label is set large on the left with the two readings as
 * bars; the quadrant on the right marks where the economy sits.
 */
export function RegimeQuadrant({ macro, country, countryLabel }: RegimeQuadrantProps) {
  const m = macro.data.find((x) => x.country === country) ?? macro.data[0];
  const gz = m.zScores.growth;
  const iz = m.zScores.inflation;
  const quadrant = classifyRegime(gz, iz);
  // Both readings within ±1 of their usual: the quadrant label would claim a
  // phase the words below contradict, so it says NORMAL and leans.
  const nearNormal = Math.abs(gz) < 1 && Math.abs(iz) < 1;
  const regime = nearNormal
    ? { ...quadrant, label: 'Normal', blurb: `Pertumbuhan dan inflasi sama-sama dekat kebiasaannya, sedikit condong ke ${quadrant.label}.` }
    : quadrant;
  const accent = regime.quadrant === 'GOLDILOCKS' && !nearNormal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <p className="rise" style={{ ['--i' as string]: 2, margin: '-8px 0 4px', maxWidth: 900, fontSize: 15, lineHeight: 1.6, color: 'var(--mut)' }}>
        Fase ekonomi AS dilihat dari dua hal: pertumbuhan ekonomi dan inflasi inti, masing-masing dibandingkan dengan kebiasaannya
        selama 2 tahun terakhir. Labelnya menggambarkan arah relatif, bukan kondisi mutlak. Kalau keduanya masih dekat kebiasaannya,
        labelnya Normal.
      </p>
      <div className="rise" style={{ ['--i' as string]: 3 }}>
      <Panel>
        <div className="ember-halo" aria-hidden="true" style={{ top: -320, left: -200 }} />
        <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexWrap: 'wrap', gap: 40 }}>
          <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>{countryLabel} · fase ekonomi</h2>
              <MockBadge env={macro} />
            </div>
            <span className={`t-display${accent ? ' t-accent' : ''}`} style={{ fontSize: 'clamp(56px, 7vw, 88px)', color: accent ? 'var(--accent)' : 'var(--txt)' }}>
              {regime.label}
            </span>
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5, color: '#e9ddd2' }}>{regime.blurb}</p>
            <ScoreBar label="Pertumbuhan ekonomi" z={gz} />
            <ScoreBar label="Inflasi inti" z={iz} />
          </div>

          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 12, color: 'var(--dim)', textAlign: 'center' }}>
                Inflasi turun ← → Inflasi naik
              </div>
              <div style={{ flex: 1, position: 'relative', aspectRatio: '1 / 1', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                {CELLS.map((c) => {
                  const on = c.name === quadrant.quadrant;
                  return (
                    <div
                      key={c.name}
                      style={{
                        borderRadius: c.radius,
                        background: on ? 'color-mix(in srgb, var(--accent) 20%, var(--sunk))' : 'var(--sunk)',
                        padding: 18,
                        display: 'flex',
                        alignItems: c.justify,
                        justifyContent: c.align,
                        fontSize: 16,
                        fontWeight: 600,
                        color: on ? '#ffd2ae' : 'var(--mut)',
                        transition: 'background-color 350ms ease',
                      }}
                    >
                      {c.label}
                    </div>
                  );
                })}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <line x1={50} y1={50} x2={toPct(gz)} y2={100 - toPct(iz)} stroke="#f6eee7" strokeOpacity={0.55} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                </svg>
                <span
                  className="iris-pulse"
                  role="img"
                  aria-label={`Posisi sekarang: ${regime.label}`}
                  style={{
                    position: 'absolute',
                    left: `${toPct(gz)}%`,
                    top: `${100 - toPct(iz)}%`,
                    width: 24,
                    height: 24,
                    margin: -12,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: '4px solid #ffd2ae',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 26, fontSize: 12, color: 'var(--dim)' }}>
              <span>← Pertumbuhan melambat</span>
              <span>Pertumbuhan menguat →</span>
            </div>
          </div>
        </div>
        <SourceFootnote env={macro} />
      </Panel>
      </div>
    </div>
  );
}
