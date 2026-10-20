import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import { fmtUsd, fmtPct } from '@/lib/format';

export interface DriverBreakdownProps {
  forecast: Envelope<WeeklyForecastData>;
}

/**
 * The signals that actually produced the forecast, as bars that grow left
 * (pulls down) or right (pushes up) from a centre line. They are the real
 * contributions computed with the score and sum to it.
 */
export function DriverBreakdown({ forecast }: DriverBreakdownProps) {
  const f = forecast.data;
  const mid = (f.range.min + f.range.max) / 2;
  const bandWidthPct = mid > 0 ? ((f.range.max - f.range.min) / mid) * 100 : 0;

  // Scale every bar against the largest contribution so the relative pull of
  // each signal is legible, rather than against a fixed 1.0.
  const maxContribution = Math.max(...f.drivers.map((d) => Math.abs(d.contribution)), 0.05);
  const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`;

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="What drives the call" note="Kontribusi ke skor" right={<MockBadge env={forecast} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 14px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {f.drivers.map((d) => {
          const w = `${((Math.abs(d.contribution) / maxContribution) * 100).toFixed(1)}%`;
          return (
            <div
              key={d.name}
              className="ember-row"
              title={d.reading}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) minmax(0, 1fr) 64px', alignItems: 'center', gap: 12, padding: '11px 12px' }}
            >
              <span style={{ fontSize: 14, color: '#e9ddd2', display: 'flex', flexDirection: 'column' }}>
                {d.name}
                <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>{d.reading}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', height: 12 }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  {d.contribution < 0 ? <div style={{ width: w, height: 12, borderRadius: '6px 2px 2px 6px', background: '#8a5e40' }} /> : null}
                </div>
                <div style={{ width: 2, height: 22, background: '#3a2b20' }} />
                <div style={{ flex: 1, display: 'flex' }}>
                  {d.contribution > 0 ? <div className="ember-grow" style={{ width: w, height: 12, borderRadius: '2px 6px 6px 2px', background: 'var(--accent)' }} /> : null}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{sign(d.contribution)}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--dim)', padding: '4px 12px 0' }}>
          <span>Menarik turun</span>
          <span>
            Skor gabungan <b style={{ color: f.score >= 0 ? '#ffb27a' : 'var(--down)' }}>{sign(f.score)}</b>
          </span>
          <span>Mendorong naik</span>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 4, padding: '16px 26px 8px' }}>
        <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 10 }}>Kisaran gejolak 7 hari (bukan prediksi arah atau besaran)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {(
            [
              ['Bawah', `$${fmtUsd(f.range.min).split('.')[0]}`],
              ['Tengah', `$${fmtUsd(mid).split('.')[0]}`],
              ['Atas', `$${fmtUsd(f.range.max).split('.')[0]}`],
              ['Lebar', fmtPct(bandWidthPct, false)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="iris-inset" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{k}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
