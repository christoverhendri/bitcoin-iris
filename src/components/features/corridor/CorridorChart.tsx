import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import { ChartHover } from '@/components/charts/ChartHover';
import type { Envelope } from '@/lib/envelope';
import type { PowerLawData } from '@/lib/features/powerLawCorridor';
import { ZONE_COLOR, usd } from '@/lib/features/halvingCycle/present';
import { toDay } from '@/lib/quant/daily';
import { ZONE_EDGES } from '@/lib/quant/config';
import { ZONES, bandsAt, zoneOf } from '@/lib/quant/powerLaw';
import { fmtDay } from '@/lib/dates';
import { Explain, decadeTicks, logScale, microText, tickUsd, yearTicks } from '../cycle/ui';

const W = 900;
const H = 430;
const PAD_R = 50;
const TOP_T = 14;
const TOP_B = 280;
const PCT_T = 300;
const PCT_B = 404;

/** Fill between band i and i+1 (p5–p25 … p75–p95): cheap → expensive. */
const BAND_FILL = ['#7a5338', '#a0613a', '#e8813a', '#ffb27a'];
const LAST = BAND_FILL.length;
const EDGES = [0, ...ZONE_EDGES, 100];

/**
 * Top: price (log) inside the rainbow bands of the newest fit. Bottom: the
 * walk-forward percentile 0–100 with the zone lines. One crosshair for both.
 */
export function CorridorChart({ pl }: { pl: Envelope<PowerLawData> }) {
  const d = pl.data;
  const pts = d.series;
  const d0 = toDay(pts[0].date);
  const d1 = toDay(pts[pts.length - 1].date);
  const x = (day: number) => ((day - d0) / (d1 - d0)) * (W - PAD_R);
  const bands = pts.map((p) => bandsAt(d.fit, toDay(p.date)));
  const lo = Math.min(...pts.map((p) => p.price), ...bands.map((b) => b[0])) * 0.8;
  const hi = Math.max(...pts.map((p) => p.price), ...bands.map((b) => b[LAST])) * 1.2;
  const y = logScale(lo, hi, TOP_T, TOP_B);
  const yp = (pct: number) => PCT_B - (pct / 100) * (PCT_B - PCT_T);

  const line = (vals: number[], yy: (v: number) => number) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(toDay(pts[i].date)).toFixed(1)},${yy(v).toFixed(1)}`).join(' ');
  const ribbon = (qa: number, qb: number) => {
    const up = bands.map((b, i) => `${i ? 'L' : 'M'}${x(toDay(pts[i].date)).toFixed(1)},${y(b[qb]).toFixed(1)}`).join(' ');
    const down = bands
      .map((b, i) => `L${x(toDay(pts[i].date)).toFixed(1)},${y(b[qa]).toFixed(1)}`)
      .reverse()
      .join(' ');
    return `${up} ${down} Z`;
  };

  return (
    <Panel>
      <PanelHeader title="KORIDOR POWER-LAW" note={`mingguan sejak ${pts[0].date.slice(0, 4)} · skala log`} right={<MockBadge env={pl} />} />
      <Explain>
        Atas: harga (garis oranye) di dalam pita warna, dari cokelat gelap = murah sampai oranye terang = mahal. Pita digambar dengan fit
        terbaru, jadi bentuk pita di masa lalu memakai pengetahuan sekarang. Bawah: persentil walk-forward yang{' '}
        <b>tidak</b> memakai hindsight — itu angka yang dipakai untuk semua uji di halaman ini.
      </Explain>
      <div style={{ position: 'relative', zIndex: 4, padding: '12px 22px' }}>
        <ChartHover
          viewW={W}
          viewH={H}
          height={430}
          svgStyle={{ background: 'var(--sunk)' }}
          ariaLabel="Harga BTC dalam koridor power-law dan persentilnya"
          points={pts.map((p, i) => ({
            x: x(toDay(p.date)),
            y: y(p.price),
            lines: [fmtDay(p.date), `Harga ${usd(p.price)}`, `Persentil ${p.pct.toFixed(0)} · ${zoneOf(p.pct)}`, `Pita terbawah–teratas ${usd(bands[i][0])} – ${usd(bands[i][LAST])}`],
          }))}
        >
          {decadeTicks(lo, hi).map((p) => (
            <g key={p}>
              <line x1={0} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
              <text x={W - PAD_R + 6} y={y(p) + 3} {...microText} fill="var(--dim)">
                {tickUsd(p)}
              </text>
            </g>
          ))}
          {BAND_FILL.map((_, k) => (
            <path key={k} d={ribbon(k, k + 1)} fill={BAND_FILL[k]} fillOpacity={0.16} stroke="none" />
          ))}
          {[0, LAST].map((q) => (
            <path key={q} d={line(bands.map((b) => b[q]), y)} fill="none" stroke={q ? 'var(--down)' : 'var(--up)'} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={line(pts.map((p) => p.price), y)} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 60%, transparent))' }} />

          {/* percentile strip */}
          {ZONES.map((z, i) => (
            <rect key={z} x={0} width={W - PAD_R} y={yp(EDGES[i + 1])} height={yp(EDGES[i]) - yp(EDGES[i + 1])} fill={ZONE_COLOR[z]} fillOpacity={0.08} />
          ))}
          {ZONE_EDGES.map((v) => (
            <g key={v}>
              <line x1={0} x2={W - PAD_R} y1={yp(v)} y2={yp(v)} stroke="var(--line2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <text x={W - PAD_R + 6} y={yp(v) + 3} {...microText} fill="var(--dim)">
                {v}
              </text>
            </g>
          ))}
          <path d={line(pts.map((p) => p.pct), yp)} fill="none" stroke="var(--blue)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={4} y={PCT_T - 6} {...microText} fill="var(--mut)">
            PERSENTIL 0–100 (WALK-FORWARD)
          </text>
          {yearTicks(d0, d1).map((t) => (
            <text key={t.year} x={x(t.day)} y={H - 8} {...microText} fill="var(--dim)" textAnchor={x(t.day) < 20 ? 'start' : 'middle'}>
              {t.year}
            </text>
          ))}
        </ChartHover>
      </div>
      <SourceFootnote env={pl} />
    </Panel>
  );
}
