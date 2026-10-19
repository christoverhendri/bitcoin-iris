import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote, Tag } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import {
  BUCKET_WORD,
  coverageTone,
  fmtPctOrDash,
  nextScheduledRun,
  runInsideTone,
  shippedScores,
} from '@/lib/features/monthlyForecast/present';
import { fmtDay } from '@/lib/dates';
import { usd as fmtUsd } from '@/lib/features/halvingCycle/present';
import { toneVar } from '@/lib/theme/tokens';

/**
 * How far the model can be trusted, from two checks the worker computes:
 * the leakage-free backtest summary (one line per horizon — the full engine
 * comparison stays in the worker's output) and the live track record, where
 * each earlier published run is scored against the closes that followed.
 */
export function MonthlyAccuracy({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const scores = shippedScores(d);
  const m = d.model;
  const next = nextScheduledRun(d.runAt);

  return (
    <Panel>
      <PanelHeader title="SEBERAPA BISA DIPERCAYA" note="uji mundur + catatan prakiraan yang sudah lewat" right={<MockBadge env={fc} />} />
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

      <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.14em', color: 'var(--mut)', padding: '12px 12px 4px' }}>
        PRAKIRAAN MINGGU-MINGGU SEBELUMNYA vs HARGA SUNGGUHAN
      </div>
      {d.trackRecord.length === 0 ? (
        <div style={{ padding: '4px 12px 10px', fontSize: 10.5, color: 'var(--dim)' }}>
          Belum ada — terisi sendiri mulai prakiraan minggu kedua.
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>
          <DataTable>
            <thead>
              <tr>
                <th>DIBUAT</th>
                <th style={{ textAlign: 'right' }}>HARGA SAAT ITU</th>
                <th style={{ textAlign: 'right' }}>KISARAN 80% D+30</th>
                <th style={{ textAlign: 'right' }}>HARI BERLALU</th>
                <th style={{ textAlign: 'right' }}>HARI DI DALAM 80%</th>
                <th>CLOSE TERAKHIR</th>
              </tr>
            </thead>
            <tbody>
              {d.trackRecord.map((r) => (
                <tr key={r.asOf}>
                  <td>{fmtDay(r.asOf)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtUsd(r.spot)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {fmtUsd(r.p10End)} – {fmtUsd(r.p90End)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.daysObserved}/{r.daysTotal}
                    {r.complete ? ' · selesai' : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.insideP10P90 === null ? 'var(--dim)' : toneVar(runInsideTone(r.insideP10P90)) }}>
                    {fmtPctOrDash(r.insideP10P90)}
                  </td>
                  <td style={{ color: 'var(--mut)' }}>
                    {r.lastClose === null ? '—' : `${fmtUsd(r.lastClose)}${r.lastBucket ? ` · ${BUCKET_WORD[r.lastBucket] ?? r.lastBucket}` : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
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
