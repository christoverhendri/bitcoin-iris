import { Panel, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { fmtSignedPct, ladderRows, pctVsSpot } from '@/lib/features/monthlyForecast/present';
import { fmtDay } from '@/lib/dates';
import { Headline } from '../forward/ui';

const k = (v: number) => `$${(v / 1000).toFixed(1)}k`;
const COLS = 'minmax(110px, 0.9fr) minmax(200px, 2.4fr) minmax(130px, 1fr) 84px';

/**
 * The simulated range read off at D+1 / 7 / 14 / 21 / 30, one bullet bar per
 * day: the light band is 9 of 10 paths, the strong band half of them, the
 * bright tick the median, the cream tick today's price. Every bar shares one
 * scale, so the widening is visible at a glance.
 */
export function MonthlyRange({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const rows = ladderRows(d);
  const last = d.bands[d.bands.length - 1];
  const lo = Math.min(last.p5, d.spot) * 0.99;
  const hi = Math.max(last.p95, d.spot) * 1.01;
  const x = (v: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
  const w = (a: number, b: number) => `${(((b - a) / (hi - lo)) * 100).toFixed(2)}%`;
  const halfMove = ((last.p75 - last.p25) / 2 / d.spot) * 100;

  return (
    <Panel style={{ height: '100%' }}>
      <div style={{ position: 'relative', zIndex: 4, padding: '28px 28px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="t-title" style={{ margin: 0, fontSize: 18 }}>
                Kisaran harga per hari
              </h2>
              <MockBadge env={fc} />
            </div>
            <span style={{ fontSize: 14, color: 'var(--mut)' }}>
              Dari harga {k(d.spot)} pada {fmtDay(d.asOf)}
            </span>
          </div>
          <Headline value={`±${halfMove.toFixed(1)}%`} caption={`gerak wajar dalam ${last.step} hari (separuh jalur)`} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 13, color: 'var(--dim)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 16, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 28%, var(--line))' }} />9 dari 10 jalur
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 16, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 65%, var(--line))' }} />separuh jalur
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: '#ffd2ae' }} />tengah
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: '#f6eee7' }} />harga hari ini
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 -12px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '0 12px 8px', fontSize: 13, color: 'var(--dim)', minWidth: 600 }}>
            <span>Hari ke</span>
            <span>Kisaran</span>
            <span>Rendah – tinggi</span>
            <span style={{ textAlign: 'right' }}>Tengah</span>
          </div>
          {rows.map((b) => (
            <div
              key={b.step}
              className="ember-row"
              title={`5th ${k(b.p5)} · 25th ${k(b.p25)} · median ${k(b.p50)} · 75th ${k(b.p75)} · 95th ${k(b.p95)}`}
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: 12, fontSize: 15, minWidth: 600 }}
            >
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <b>D+{b.step}</b>
                <span style={{ fontSize: 13, color: 'var(--dim)' }}>{fmtDay(b.date)}</span>
              </span>
              <div style={{ position: 'relative', height: 16, borderRadius: 999, background: 'var(--sunk)' }}>
                <span
                  className="ember-grow"
                  style={{ position: 'absolute', top: 2, bottom: 2, left: x(b.p5), width: w(b.p5, b.p95), borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 28%, var(--line))' }}
                />
                <span
                  style={{ position: 'absolute', top: 2, bottom: 2, left: x(b.p25), width: w(b.p25, b.p75), borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 65%, var(--line))' }}
                />
                <span style={{ position: 'absolute', top: -3, bottom: -3, left: x(b.p50), width: 3, marginLeft: -1.5, borderRadius: 2, background: '#ffd2ae' }} />
                <span style={{ position: 'absolute', top: -3, bottom: -3, left: x(d.spot), width: 2, marginLeft: -1, borderRadius: 2, background: '#f6eee7', opacity: 0.7 }} />
              </div>
              <span style={{ color: '#e9ddd2' }}>
                {k(b.p25)} – {k(b.p75)}
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--dim)' }}>
                  9/10: {k(b.p5)} – {k(b.p95)}
                </span>
              </span>
              <span style={{ justifySelf: 'end', textAlign: 'right' }}>
                <b>{k(b.p50)}</b>
                <span style={{ display: 'block', fontSize: 12.5, color: b.p50 >= d.spot ? '#ffb27a' : 'var(--down)' }}>
                  {fmtSignedPct(pctVsSpot(b.p50, d.spot))}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
