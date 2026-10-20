import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
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
const mono = { fontSize: 13, fill: 'var(--dim)' } as const;

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

  const end = d.bands[steps];
  const k = (v: number) => `$${(v / 1000).toFixed(1)}k`;

  return (
    <Panel>
      <div className="ember-halo" aria-hidden="true" style={{ top: -300, right: -200 }} />
      <PanelHeader
        title="Prakiraan 30 hari · Monte Carlo"
        note={`${d.nPaths.toLocaleString('en-US')} jalur · data s.d. ${fmtDay(d.asOf)}`}
        right={<MockBadge env={fc} />}
      />
      <div style={{ position: 'relative', zIndex: 4, padding: '6px 26px 4px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 15, color: 'var(--mut)' }}>Harga tengah di {fmtDay(end.date)}</span>
          <span className="t-display" style={{ fontSize: 'clamp(54px, 6vw, 84px)' }}>
            {fmtUsd(end.p50)}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: end.p50 >= d.spot ? '#ffb27a' : 'var(--down)' }}>
            {fmtSignedPct(pctVsSpot(end.p50, d.spot))} dari harga {fmtUsd(d.spot)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Separuh jalur</span>
            <span className="t-title" style={{ fontSize: 24 }}>
              {k(end.p25)} – {k(end.p75)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>8 dari 10 jalur</span>
            <span className="t-title" style={{ fontSize: 24 }}>
              {k(end.p10)} – {k(end.p90)}
            </span>
          </div>
        </div>
      </div>
      <p style={{ position: 'relative', zIndex: 4, margin: 0, padding: '14px 26px 0', fontSize: 14, lineHeight: 1.5, color: 'var(--mut)' }}>
        Ke mana harga <b>bisa</b> bergerak tiap hari, dari besarnya gejolak sekarang. Bukan tebakan arah: garis tengah sengaja dekat harga sekarang.
      </p>
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 26px 0', fontSize: 13, color: 'var(--mut)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 45%, transparent)' }} />50% jalur</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 26%, transparent)' }} />80%</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }} />90%</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: 'var(--accent)' }} />harga tengah</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: '#c9b8aa' }} />harga sungguhan</span>
      </div>
      <div style={{ position: 'relative', zIndex: 4, padding: '8px 22px 8px' }}>
        <ChartHover viewW={W} viewH={H} height={340} points={points} ariaLabel={`Kisaran harga BTC simulasi ${steps} hari ke depan`}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * span).map((p, i) => (
            <g key={i}>
              <line x1={0} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="#2a2019" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
              <text x={W - PAD_R + 6} y={y(p) + 3} {...mono}>
                {fmtUsd(p)}
              </text>
            </g>
          ))}
          {TICK_STEPS.filter((s) => s <= steps).map((s) => (
            <g key={s}>
              <line x1={coneX(s)} x2={coneX(s)} y1={PAD_T} y2={H - PAD_B} stroke="#2a2019" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              <text x={coneX(s) + 3} y={H - 8} {...mono}>
                {s === 0 ? 'Sekarang' : `D+${s} ${fmtDayShort(d.bands[s].date)}`}
              </text>
            </g>
          ))}
          <path d={ribbon('p95', 'p5')} fill="var(--accent)" fillOpacity={0.12} stroke="none" />
          <path d={ribbon('p90', 'p10')} fill="var(--accent)" fillOpacity={0.14} stroke="none" />
          <path d={ribbon('p75', 'p25')} fill="var(--accent)" fillOpacity={0.22} stroke="none" />
          <defs>
            <clipPath id={CLIP_ID}>
              <rect x={0} y={PAD_T} width={W - PAD_R} height={H - PAD_T - PAD_B} />
            </clipPath>
          </defs>
          {d.paths.map((p, i) => (
            <path key={i} d={line(p.map((price, s) => [coneX(s), price]))} fill="none" stroke="#c9b8aa" strokeOpacity={0.28} clipPath={`url(#${CLIP_ID})`} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={line(d.bands.map((b) => [coneX(b.step), b.p50]))} fill="none" stroke="var(--accent)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 70%, transparent))' }} />
          <path d={line(hist.map((p, i) => [histX(i), p.close]))} fill="none" stroke="#c9b8aa" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={splitX} x2={splitX} y1={PAD_T} y2={H - PAD_B} stroke="#5a4130" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
          <text x={4} y={H - 8} {...mono}>
            {hist.length} hari terakhir
          </text>
        </ChartHover>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
