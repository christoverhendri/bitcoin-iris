import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SeasonalityCell } from '@/lib/features/seasonality';
import { monthlySummary } from '@/lib/features/seasonality';
import { fmtPct, MONTHS } from '@/lib/format';

const NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/**
 * The running month, historically: how often it closed up (the probability the
 * visitor asks for), its average, best and worst, how it is doing so far, and
 * the average of every month as a bar chart with this one lit. Completed months
 * only; the running month is shown as "so far" and never counted.
 */
export function SeasonalityNow({ seasonality }: { seasonality: Envelope<SeasonalityCell[]> }) {
  const cells = seasonality.data;
  const summary = monthlySummary(cells);
  const running = cells.find((c) => c.partial) ?? null;
  const latest = [...cells].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0];
  const month = running?.month ?? (latest ? (latest.month % 12) + 1 : 1);
  const s = summary[month - 1];
  const past = cells.filter((c) => c.month === month && !c.partial).map((c) => c.returnPct);
  const best = past.length ? Math.max(...past) : null;
  const worst = past.length ? Math.min(...past) : null;
  const means = summary.map((x) => x.mean ?? 0);
  const maxAbs = Math.max(1, ...means.map((v) => Math.abs(v)));

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title={`${NAMES[month - 1]}, secara historis`} note={`${s.n} tahun`} right={<MockBadge env={seasonality} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="t-display t-accent" style={{ fontSize: 72, color: 'var(--accent)' }}>
            {s.pctUp === null ? '—' : `${Math.round(s.pctUp)}%`}
          </span>
          <span style={{ fontSize: 15, color: '#e9ddd2' }}>
            peluang ditutup naik: naik di {s.up} dari {s.n} tahun
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {(
            [
              ['Rata-rata', s.mean === null ? '—' : fmtPct(s.mean, true, 1), false],
              ['Median', s.median === null ? '—' : fmtPct(s.median, true, 1), false],
              ['Terbaik', best === null ? '—' : fmtPct(best, true, 1), false],
              ['Terburuk', worst === null ? '—' : fmtPct(worst, true, 1), false],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="iris-inset" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{k}</span>
              <span style={{ fontSize: 19, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          {running ? (
            <div
              className="iris-inset"
              style={{ gridColumn: '1 / -1', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: 'color-mix(in srgb, var(--accent) 14%, var(--sunk))' }}
            >
              <span style={{ fontSize: 13, color: '#e9c4a6' }}>
                {MONTHS[running.month - 1]} {running.year} sejauh ini
              </span>
              <span style={{ fontSize: 19, fontWeight: 600, color: running.returnPct >= 0 ? '#ffb27a' : 'var(--down)' }}>{fmtPct(running.returnPct, true, 1)}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--mut)' }}>Rata-rata tiap bulan</span>
          <div role="img" aria-label="Rata-rata return tiap bulan" style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 6, height: 130, padding: 12, borderRadius: 14, background: 'var(--sunk)' }}>
            {means.map((v, i) => {
              const h = `${Math.max(3, (Math.abs(v) / maxAbs) * 48)}%`;
              const on = i === month - 1;
              return (
                <div key={i} title={`${MONTHS[i]}: ${fmtPct(v, true, 1)} rata-rata`} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                    {v >= 0 ? (
                      <span style={{ width: '100%', height: h, minHeight: 3, borderRadius: '4px 4px 1px 1px', background: on ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, var(--sunk))' }} />
                    ) : null}
                  </div>
                  <span style={{ height: 2, background: '#3a2b20' }} />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
                    {v < 0 ? <span style={{ width: '100%', height: h, minHeight: 3, borderRadius: '1px 1px 4px 4px', background: on ? '#b8663a' : '#4a3426' }} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 12px', fontSize: 11.5, color: 'var(--dim)' }}>
            {MONTHS.map((m, i) => (
              <span key={m} style={{ flex: 1, textAlign: 'center', color: i === month - 1 ? '#ffb27a' : undefined, fontWeight: i === month - 1 ? 700 : 400 }}>
                {m.charAt(0) + m.slice(1, 3).toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      </div>
      <SourceFootnote env={seasonality} />
    </Panel>
  );
}
