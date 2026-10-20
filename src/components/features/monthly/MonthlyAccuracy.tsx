import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { coverageTone, fmtPctOrDash, nextScheduledRun, shippedScores } from '@/lib/features/monthlyForecast/present';
import { fmtDay } from '@/lib/dates';

const BANDS = [
  { key: '90' as const, label: 'Kisaran 90%', target: 90 },
  { key: '80' as const, label: 'Kisaran 80%', target: 80 },
  { key: '50' as const, label: 'Kisaran 50%', target: 50 },
];

/**
 * "Is the range honest?": in the leakage-free backtest, how often the real
 * close fell inside each band, drawn as a bar against the band's own target.
 * One tile per horizon for the 80% band underneath.
 */
export function MonthlyAccuracy({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const scores = shippedScores(d);
  const longest = scores[scores.length - 1];
  const next = nextScheduledRun(d.runAt);
  const honest = longest ? BANDS.every((b) => coverageTone(longest.m.coverage[b.key], b.target) !== 'down') : false;

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Is the range honest?" note={longest ? `uji mundur ${longest.h.h} hari` : undefined} right={<MockBadge env={fc} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {longest ? (
          <>
            <span style={{ fontSize: 14, color: 'var(--mut)' }}>
              Seberapa sering harga sungguhan jatuh di dalam tiap kisaran
              {d.backtest ? `, ${d.backtest.origins} tanggal uji (${fmtDay(d.backtest.firstOrigin)} – ${fmtDay(d.backtest.lastOrigin)})` : ''}
            </span>
            {BANDS.map((b) => {
              const v = longest.m.coverage[b.key];
              const tone = coverageTone(v, b.target);
              return (
                <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 15 }}>{b.label}</span>
                    <span className="t-title" style={{ fontSize: 26, color: tone === 'down' ? 'var(--down)' : 'var(--txt)' }}>
                      {fmtPctOrDash(v)}
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: 12, borderRadius: 999, background: 'var(--line)' }}>
                    <div
                      className="ember-grow"
                      style={{
                        width: `${Math.min(100, v * 100)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: tone === 'up' ? 'var(--accent)' : tone === 'amber' ? '#b8663a' : '#6b4a35',
                      }}
                    />
                    <span style={{ position: 'absolute', left: `${b.target}%`, top: -5, width: 2, height: 22, background: '#f6eee7' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--dim)' }}>Target {b.target}%</span>
                </div>
              );
            })}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: honest ? 'color-mix(in srgb, var(--accent) 12%, var(--sunk))' : 'var(--sunk)',
                fontSize: 15,
                lineHeight: 1.5,
              }}
            >
              {honest
                ? 'Ketiga kisaran mendekati targetnya: tidak terlalu lebar, tidak terlalu sempit.'
                : 'Ada kisaran yang meleset lebih dari 10 poin dari targetnya; baca lebarnya dengan hati-hati.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${scores.length}, minmax(0, 1fr))`, gap: 10 }}>
              {scores.map(({ h, m }) => (
                <div key={h.h} className="iris-inset" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, color: 'var(--dim)' }}>{h.h} hari</span>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{fmtPctOrDash(m.coverage['80'])}</span>
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>kisaran 80%</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--mut)' }}>Run ini tidak menyertakan uji mundur.</span>
        )}
        <span style={{ fontSize: 13, color: 'var(--dim)' }}>
          Gejolak awal {d.model.sigmaNowAnnPct.toFixed(1)}%/thn
          {d.model.volSource === 'dvol_vrp' && d.model.dvolPct !== null ? ` dari DVOL ${d.model.dvolPct.toFixed(1)}%` : ' dari GARCH'}
          {next ? ` · run berikutnya ${fmtDay(next)}` : ''}
        </span>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
