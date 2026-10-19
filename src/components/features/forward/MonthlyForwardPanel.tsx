import { Panel, PanelGrid, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { BUCKET_WORD } from '@/lib/features/monthlyForecast/present';
import { MIN_MONTHLY_PER_HORIZON } from '@/lib/forward/stats';
import { usd } from '@/lib/features/halvingCycle/present';
import { fmtDay } from '@/lib/dates';
import { Figure, Note, pct } from './ui';

/**
 * Forward validation of the monthly runs: for each horizon a series of runs
 * spaced at least that many days apart (D+7 every run, D+14 every second, D+28
 * every fourth), so no two scored windows overlap, each scored against the
 * close that printed. The "expected" range is what a correctly calibrated 80%
 * band would usually give for that many windows.
 */
export function MonthlyForwardPanel({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const f = fc.data.forward;
  const long = f.horizons[f.horizons.length - 1];
  return (
    <Panel>
      <PanelHeader title="FORWARD VALIDATION · PRAKIRAAN 30 HARI" note={f.start ? `sejak ${fmtDay(f.start)} · ${f.runs} run` : ''} right={<MockBadge env={fc} />} />
      <Note>
        Prakiraan dibuat tiap minggu, jadi jendela 30 harinya saling tumpang tindih. Untuk penilaian, tiap jangka hanya memakai run
        yang jaraknya cukup jauh supaya tidak tumpang tindih: <b>7 hari</b> semua run, <b>14 hari</b> tiap run kedua, <b>28 hari</b>{' '}
        tiap run keempat. Lalu dicek: apakah harga sungguhan masuk kisaran 80% (8 dari 10 jalur)?
      </Note>
      <PanelGrid columns="repeat(auto-fit, minmax(190px, 1fr))" style={{ margin: 12 }}>
        {f.horizons.map((h) => {
          const ok = h.expected80 && h.inside80 >= h.expected80[0] && h.inside80 <= h.expected80[1];
          return (
            <Figure
              key={h.h}
              label={`${h.h} HARI · MASUK KISARAN 80%`}
              value={h.scored ? `${h.inside80}/${h.scored} · ${pct(h.inside80 / h.scored)}` : '—'}
              color={!h.scored ? undefined : ok ? 'var(--up)' : 'var(--amber)'}
              detail={
                h.scored ? (
                  <>
                    {h.expected80 ? `wajar kalau model benar: ${h.expected80[0]}–${h.expected80[1]} dari ${h.scored}` : ''}
                    {` · 90%: ${h.inside90}/${h.scored}`}
                    {h.meanAbsErr !== null ? ` · selisih tengah rata-rata ${pct(h.meanAbsErr, 1)}` : ''}
                    <br />
                    {h.enough ? 'cukup untuk disimpulkan' : `belum cukup: perlu ≥${MIN_MONTHLY_PER_HORIZON} jendela`}
                  </>
                ) : (
                  `${h.inSeries} run dalam seri, belum ada yang ${h.h} harinya lewat`
                )
              }
            />
          );
        })}
      </PanelGrid>
      <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.14em', color: 'var(--mut)', padding: '0 12px 4px' }}>
        SERI {long.h} HARI (TIDAK TUMPANG TINDIH)
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>
        <DataTable>
          <thead>
            <tr>
              <th>DIBUAT</th>
              <th>DINILAI PADA</th>
              <th style={{ textAlign: 'right' }}>HARGA SUNGGUHAN</th>
              <th>POSISI DALAM KISARAN</th>
              <th style={{ textAlign: 'right' }}>MASUK 80%?</th>
            </tr>
          </thead>
          <tbody>
            {long.rows.slice(0, 12).map((r) => {
              const o = r.outcome;
              const due = new Date(Date.parse(`${r.asOf}T00:00:00Z`) + long.h * 86_400_000).toISOString().slice(0, 10);
              return (
                <tr key={r.asOf}>
                  <td>{fmtDay(r.asOf)}</td>
                  <td>{fmtDay(o?.date ?? due)}</td>
                  <td style={{ textAlign: 'right' }}>{o ? usd(o.close) : 'menunggu'}</td>
                  <td style={{ color: 'var(--mut)' }}>{o ? BUCKET_WORD[o.bucket] ?? o.bucket : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: !o ? 'var(--dim)' : o.inside80 ? 'var(--up)' : 'var(--down)' }}>
                    {!o ? '—' : o.inside80 ? 'YA' : 'TIDAK'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
