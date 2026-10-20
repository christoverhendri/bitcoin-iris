import Link from 'next/link';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { fmtSignedPct, pctVsSpot } from '@/lib/features/monthlyForecast/present';
import { fmtDay } from '@/lib/dates';

const W = 480;
const H = 220;
const k = (v: number) => `$${(v / 1000).toFixed(1)}k`;

/**
 * The 30-day Monte Carlo in one card, for the Forecast overview: the last
 * weeks of price, then the simulated fan (90% and 50% of paths) and its
 * median, with the low / median / high of the final day underneath.
 */
export function MonthlyPreview({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const steps = d.bands.length - 1;
  const end = d.bands[steps];
  const hist = d.history.slice(-Math.max(10, Math.round(steps * 0.7)));
  const splitX = W * 0.28;
  const hx = (i: number) => (hist.length > 1 ? (i / (hist.length - 1)) * splitX : splitX);
  const cx = (s: number) => splitX + (s / steps) * (W - splitX);
  const all = [...hist.map((p) => p.close), ...d.bands.flatMap((b) => [b.p5, b.p95])];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const y = (v: number) => H - 14 - ((v - lo) / (hi - lo || 1)) * (H - 28);
  const path = (pts: [number, number][]) => pts.map(([px, v], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const band = (u: 'p95' | 'p75', l: 'p5' | 'p25') =>
    `${path(d.bands.map((b) => [cx(b.step), b[u]]))} ${[...d.bands]
      .reverse()
      .map((b) => `L${cx(b.step).toFixed(1)} ${y(b[l]).toFixed(1)}`)
      .join(' ')} Z`;

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="30 hari ke depan" note={`${d.nPaths.toLocaleString('en-US')} jalur simulasi`} right={<MockBadge env={fc} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 26px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kisaran 30 hari: tengah ${k(end.p50)}, 90% jalur antara ${k(end.p5)} dan ${k(end.p95)}`}>
          <path d={band('p95', 'p5')} fill="var(--accent)" fillOpacity={0.14} />
          <path d={band('p75', 'p25')} fill="var(--accent)" fillOpacity={0.3} />
          <path d={path(hist.map((p, i) => [hx(i), p.close]))} fill="none" stroke="#c9b8aa" strokeWidth={2} strokeLinejoin="round" />
          <path
            d={path(d.bands.map((b) => [cx(b.step), b.p50]))}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 70%, transparent))' }}
          />
          <circle cx={splitX} cy={y(d.spot)} r={5} fill="#ffd2ae" />
          <text x={splitX + 6} y={H - 2} fill="var(--dim)" fontSize={12}>
            {fmtDay(d.asOf)}
          </text>
          <text x={W - 2} y={14} textAnchor="end" fill="var(--dim)" fontSize={12}>
            95th
          </text>
          <text x={W - 2} y={H - 2} textAnchor="end" fill="var(--dim)" fontSize={12}>
            5th
          </text>
        </svg>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="iris-inset" style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Rendah (5th)</span>
            <span style={{ fontSize: 19, fontWeight: 600 }}>{k(end.p5)}</span>
          </div>
          <div
            className="iris-inset"
            style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, background: 'color-mix(in srgb, var(--accent) 14%, var(--sunk))' }}
          >
            <span style={{ fontSize: 13, color: '#e9c4a6' }}>Tengah</span>
            <span style={{ fontSize: 19, fontWeight: 600 }}>{k(end.p50)}</span>
          </div>
          <div className="iris-inset" style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Tinggi (95th)</span>
            <span style={{ fontSize: 19, fontWeight: 600 }}>{k(end.p95)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--mut)' }}>
            Tengah di {fmtDay(end.date)}: {fmtSignedPct(pctVsSpot(end.p50, d.spot))} dari harga sekarang
          </span>
          <Link href="/forecast/30d" className="ember-btn">
            Buka prakiraan bulanan
          </Link>
        </div>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
