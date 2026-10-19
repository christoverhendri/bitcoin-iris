import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import { ChartHover } from '@/components/charts/ChartHover';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { fmtSignedPct, pctVsSpot } from '@/lib/features/monthlyForecast/present';
import { fmtDay, fmtDayShort } from '@/lib/dates';
import { usd as fmtUsd } from '@/lib/features/halvingCycle/present';

/**
 * Timothy's 30-day Monte Carlo (from motmots/iris-monthly-forecast, chart
 * adapted): actual closes on the left, the next 30 days on the right as nested
 * ribbons, with a handful of real simulated paths chosen across the range of
 * outcomes (not at random) so the spread is visible. Hover: date and price,
 * or the simulated range for that day.
 */

const W = 900;
const H = 320;
const PAD_T = 14;
const PAD_B = 26;
const PAD_R = 62;
const HISTORY_SHARE = 0.3;
const TICK_STEPS = [0, 7, 14, 21, 30];
const CLIP_ID = 'monthly-plot-area';
const mono = { fontFamily: 'var(--mono)', fontSize: 8, fill: 'var(--dim)' } as const;

export function MonthlyFan({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const steps = d.bands.length - 1;
  const hist = d.history;
  const splitX = (W - PAD_R) * HISTORY_SHARE;
  const histX = (i: number) => (i / Math.max(1, hist.length - 1)) * splitX;
  const coneX = (step: number) => splitX + (step / steps) * (W - PAD_R - splitX);

  // Scale on history and the P5–P95 envelope; an extreme path is clipped instead of squashing the ribbons.
  const prices = [...hist.map((p) => p.close), ...d.bands.flatMap((b) => [b.p5, b.p95])].filter((p) => Number.isFinite(p) && p > 0);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const y = (price: number) => H - PAD_B - ((price - lo) / span) * (H - PAD_T - PAD_B);
  const line = (pts: [number, number][]) => pts.map(([x, py], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y(py).toFixed(1)}`).join(' ');
  const ribbon = (upper: 'p95' | 'p90' | 'p75', lower: 'p5' | 'p10' | 'p25') => {
    const up = line(d.bands.map((b) => [coneX(b.step), b[upper]]));
    const down = [...d.bands].reverse().map((b) => `L${coneX(b.step).toFixed(1)},${y(b[lower]).toFixed(1)}`).join(' ');
    return `${up} ${down} Z`;
  };

  const points = [
    ...hist.map((p, i) => ({ x: histX(i), y: y(p.close), lines: [fmtDay(p.date), `Harga ${fmtUsd(p.close)}`] })),
    ...d.bands.slice(1).map((b) => ({
      x: coneX(b.step),
      y: y(b.p50),
      lines: [
        `${fmtDay(b.date)} · D+${b.step} simulasi`,
        `Tengah ${fmtUsd(b.p50)} (${fmtSignedPct(pctVsSpot(b.p50, d.spot))})`,
        `Rendah–tinggi ${fmtUsd(b.p25)} – ${fmtUsd(b.p75)}`,
        `8 dari 10 jalur ${fmtUsd(b.p10)} – ${fmtUsd(b.p90)}`,
      ],
    })),
  ];

  return (
    <Panel>
      <PanelHeader
        title="PRAKIRAAN 30 HARI · MONTE CARLO"
        note={`${d.nPaths.toLocaleString('en-US')} jalur · data s.d. ${fmtDay(d.asOf)}`}
        right={
          <>
            <Tag label="GELAP = 50%" tone="blue" />
            <Tag label="SEDANG = 80%" tone="blue" />
            <Tag label="TERANG = 90%" tone="mut" />
            <MockBadge env={fc} />
          </>
        }
      />
      <p style={{ margin: 0, padding: '10px 12px 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Ke mana harga BTC <b>bisa</b> bergerak tiap hari selama 30 hari ke depan, berdasarkan seberapa besar gejolaknya
        sekarang — <b>bukan tebakan arah</b>. Kecenderungan naik/turun sengaja dibuang, jadi garis tengah selalu dekat harga
        sekarang. Garis tipis = beberapa jalur simulasi nyata, dipilih dari yang terendah sampai tertinggi, hanya untuk
        menunjukkan sebaran.
      </p>
      <div style={{ padding: 12 }}>
        <ChartHover viewW={W} viewH={H} height={320} points={points} svgStyle={{ background: 'var(--sunk)' }} ariaLabel={`Kisaran harga BTC simulasi ${steps} hari ke depan`}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * span).map((p, i) => (
            <g key={i}>
              <line x1={0} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
              <text x={W - PAD_R + 6} y={y(p) + 3} {...mono}>
                {fmtUsd(p)}
              </text>
            </g>
          ))}
          {TICK_STEPS.filter((s) => s <= steps).map((s) => (
            <g key={s}>
              <line x1={coneX(s)} x2={coneX(s)} y1={PAD_T} y2={H - PAD_B} stroke="var(--line)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              <text x={coneX(s) + 3} y={H - 8} {...mono}>
                {s === 0 ? 'SEKARANG' : `D+${s} ${fmtDayShort(d.bands[s].date)}`}
              </text>
            </g>
          ))}
          <path d={ribbon('p95', 'p5')} fill="var(--blue)" fillOpacity={0.08} stroke="none" />
          <path d={ribbon('p90', 'p10')} fill="var(--blue)" fillOpacity={0.12} stroke="none" />
          <path d={ribbon('p75', 'p25')} fill="var(--blue)" fillOpacity={0.18} stroke="none" />
          <defs>
            <clipPath id={CLIP_ID}>
              <rect x={0} y={PAD_T} width={W - PAD_R} height={H - PAD_T - PAD_B} />
            </clipPath>
          </defs>
          {d.paths.map((p, i) => (
            <path key={i} d={line(p.map((price, s) => [coneX(s), price]))} fill="none" stroke="var(--mut)" strokeOpacity={0.45} clipPath={`url(#${CLIP_ID})`} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={line(d.bands.map((b) => [coneX(b.step), b.p50]))} fill="none" stroke="var(--blue)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={line(hist.map((p, i) => [histX(i), p.close]))} fill="none" stroke="var(--txt)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          <line x1={splitX} x2={splitX} y1={PAD_T} y2={H - PAD_B} stroke="var(--line2)" vectorEffect="non-scaling-stroke" />
          <text x={4} y={H - 8} {...mono} letterSpacing="0.12em">
            {hist.length} HARI TERAKHIR
          </text>
        </ChartHover>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
