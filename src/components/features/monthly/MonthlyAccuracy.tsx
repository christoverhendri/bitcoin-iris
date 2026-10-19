import { Panel, PanelHeader, MockBadge, SourceFootnote, Tag } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { coverageTone, fmtPctOrDash, nextScheduledRun, shippedScores } from '@/lib/features/monthlyForecast/present';
import { fmtDay } from '@/lib/dates';

/**
 * The leakage-free backtest in one line per horizon (the full engine comparison
 * stays in the worker's output). The live record of published runs is the
 * forward-validation panel below.
 */
export function MonthlyAccuracy({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const scores = shippedScores(d);
  const m = d.model;
  const next = nextScheduledRun(d.runAt);

  return (
    <Panel>
      <PanelHeader title="SEBERAPA BISA DIPERCAYA · UJI MUNDUR" note="data masa lalu, tanpa melihat masa depan" right={<MockBadge env={fc} />} />
      <p style={{ margin: 0, padding: '10px 12px 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Kisaran 80% (8 dari 10 jalur) seharusnya memuat harga sungguhan sekitar 80% dari waktu. Uji mundur memakai hanya data
        sebelum tiap tanggal uji{d.backtest ? ` (${d.backtest.origins} tanggal, ${fmtDay(d.backtest.firstOrigin)} – ${fmtDay(d.backtest.lastOrigin)})` : ''}.
      </p>
      {scores.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px 0' }}>
          {scores.map(({ h, m: s }) => (
            <Tag
              key={h.h}
              label={`${h.h} HARI: KENA ${fmtPctOrDash(s.coverage['80'])} (TARGET 80%)`}
              tone={coverageTone(s.coverage['80'], 80)}
            />
          ))}
        </div>
      ) : null}
      {scores.length && scores[scores.length - 1].m.mapeMedian !== null ? (
        <p style={{ margin: 0, padding: '8px 12px 0', fontSize: 10.5, lineHeight: 1.5, color: 'var(--dim)' }}>
          Selisih rata-rata harga tengah vs harga sungguhan setelah {scores[scores.length - 1].h.h} hari:{' '}
          {fmtPctOrDash(scores[scores.length - 1].m.mapeMedian, 1)} — sama dengan menebak &quot;harga tetap&quot;
          ({fmtPctOrDash(scores[scores.length - 1].h.naiveMape, 1)}), karena model ini memang tidak menebak arah, hanya lebar kisaran.
        </p>
      ) : null}

      <p style={{ margin: 0, padding: '10px 12px', fontSize: 10.5, lineHeight: 1.5, color: 'var(--dim)' }}>
        Dibuat seminggu sekali oleh worker Timothy (Senin 00:20 UTC){next ? `, berikutnya ${fmtDay(next)}` : ''}; tidak dihitung saat halaman dibuka.
        Gejolak awal tiap jalur:{' '}
        {m.volSource === 'dvol_vrp' && m.dvolPct !== null && m.vrpFactor !== null
          ? `${m.sigmaNowAnnPct.toFixed(1)}% per tahun = volatilitas tersirat opsi Deribit (DVOL ${m.dvolPct.toFixed(1)}%) × ${m.vrpFactor.toFixed(2)}`
          : `${m.sigmaNowAnnPct.toFixed(1)}% per tahun dari GARCH (DVOL tidak tersedia)`}
        . Harga {d.priceSource}, {d.sampleDays.toLocaleString('en-US')} hari sejak {fmtDay(d.historyStart)}.
      </p>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
