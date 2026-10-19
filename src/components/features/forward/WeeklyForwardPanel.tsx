import { Panel, PanelGrid, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForward } from '@/lib/features/weeklyForward';
import { MIN_WEEKLY_LABELED } from '@/lib/forward/stats';
import { usd } from '@/lib/features/halvingCycle/present';
import { fmtDay } from '@/lib/dates';
import { Figure, Note, pct } from './ui';

const LABEL_WORD = { UP: 'NAIK berarti', DOWN: 'TURUN berarti', NOISE: 'gerak kecil (tidak dihitung)' } as const;

/**
 * Forward validation of the weekly signal: every signal published at a week
 * close, scored after its 7 days with the training label rule. Rules are fixed
 * (see `src/lib/forward/stats.ts`); nothing is re-predicted or removed.
 */
export function WeeklyForwardPanel({ fw }: { fw: Envelope<WeeklyForward> }) {
  const d = fw.data;
  const tone = d.accuracy === null || d.alwaysBull === null ? 'var(--txt)' : d.accuracy > d.alwaysBull ? 'var(--up)' : 'var(--down)';
  return (
    <Panel>
      <PanelHeader title="FORWARD VALIDATION · SINYAL MINGGUAN" note={d.start ? `sejak ${fmtDay(d.start)}` : ''} right={<MockBadge env={fw} />} />
      <Note>
        Tiap Minggu tutup, model menerbitkan satu sinyal untuk 7 hari ke depan. Setelah 7 hari lewat, sinyal itu dinilai dengan
        aturan yang sama dengan saat model dilatih: <b>naik berarti</b> / <b>turun berarti</b> kalau gerak 7 harinya lebih besar
        dari setengah gejolak mingguan; gerak kecil tidak dihitung. Sinyal yang sudah terbit tidak pernah diubah atau dihapus.
      </Note>
      <PanelGrid columns="repeat(auto-fit, minmax(170px, 1fr))" style={{ margin: 12 }}>
        <Figure
          label="SINYAL TERBIT"
          value={String(d.published)}
          detail={`${d.scored} sudah dinilai · ${d.pending} menunggu 7 hari${d.noise ? ` · ${d.noise} gerak kecil` : ''}`}
        />
        <Figure
          label="TEPAT"
          value={d.labeled ? `${d.correct}/${d.labeled} · ${pct(d.accuracy)}` : '—'}
          color={tone}
          detail={d.accuracyCi ? `kisaran wajar (90%): ${pct(d.accuracyCi[0])}–${pct(d.accuracyCi[1])}` : 'belum ada minggu yang bisa dinilai'}
        />
        <Figure
          label='PEMBANDING "SELALU NAIK"'
          value={pct(d.alwaysBull)}
          detail="tepatnya kalau tiap minggu cukup menebak BULL, di minggu yang sama"
        />
        <Figure
          label="CUKUP UNTUK DISIMPULKAN?"
          value={d.enough ? 'YA' : 'BELUM'}
          color={d.enough ? 'var(--up)' : 'var(--amber)'}
          detail={`perlu ≥${MIN_WEEKLY_LABELED} minggu yang dinilai (sekarang ${d.labeled})`}
        />
      </PanelGrid>
      {d.bySignal.some((s) => s.n) ? (
        <div style={{ padding: '0 12px 6px', fontSize: 10.5, color: 'var(--dim)' }}>
          {d.bySignal.map((s) => `${s.signal}: ${s.correct}/${s.n} tepat`).join(' · ')}
          {d.models.length > 1 ? ` · ${d.models.length} versi model dalam seri ini (dilatih ulang)` : ''}
        </div>
      ) : null}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>
        <DataTable>
          <thead>
            <tr>
              <th>MINGGU TUTUP</th>
              <th>SINYAL</th>
              <th style={{ textAlign: 'right' }}>HARGA AWAL → AKHIR</th>
              <th style={{ textAlign: 'right' }}>GERAK 7 HARI</th>
              <th>HASIL</th>
              <th style={{ textAlign: 'right' }}>TEPAT?</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.slice(0, 12).map((r) => {
              const z = r.realized;
              return (
                <tr key={r.as_of}>
                  <td>{fmtDay(r.as_of)}</td>
                  <td style={{ color: r.signal === 'BULL' ? 'var(--up)' : r.signal === 'BEAR' ? 'var(--down)' : 'var(--mut)', fontWeight: 700 }}>{r.signal}</td>
                  <td style={{ textAlign: 'right' }}>{z ? `${usd(z.close_as_of)} → ${usd(z.close_end)}` : '—'}</td>
                  <td style={{ textAlign: 'right', color: z ? (z.return_7d >= 0 ? 'var(--up)' : 'var(--down)') : 'var(--dim)' }}>
                    {z ? `${z.return_7d >= 0 ? '+' : '−'}${Math.abs(z.return_7d * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ color: 'var(--mut)' }}>{z ? LABEL_WORD[z.label] : `menunggu s.d. ${fmtDay(r.endDate)}`}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: z?.correct === true ? 'var(--up)' : z?.correct === false ? 'var(--down)' : 'var(--dim)' }}>
                    {z?.correct === true ? 'YA' : z?.correct === false ? 'TIDAK' : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      <SourceFootnote env={fw} />
    </Panel>
  );
}
