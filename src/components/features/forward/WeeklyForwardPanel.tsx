import { Panel, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForward } from '@/lib/features/weeklyForward';
import { MIN_WEEKLY_LABELED } from '@/lib/forward/stats';
import { usd } from '@/lib/features/halvingCycle/present';
import { fmtDay } from '@/lib/dates';
import { Headline, OutcomeSquares, ResultTag, pct, type Outcome } from './ui';

const COLS = 'minmax(90px, 1fr) minmax(110px, 1.1fr) minmax(170px, 1.6fr) minmax(80px, 0.8fr) 92px';

/**
 * Forward validation of the weekly signal: every signal published at a week
 * close, scored after its 7 days with the training label rule. Rules are fixed
 * (see `src/lib/forward/stats.ts`); nothing is re-predicted or removed.
 */
export function WeeklyForwardPanel({ fw }: { fw: Envelope<WeeklyForward> }) {
  const d = fw.data;
  const outcomeOf = (r: WeeklyForward['rows'][number]): Outcome =>
    !r.realized ? 'pending' : r.realized.correct === true ? 'hit' : r.realized.correct === false ? 'miss' : 'skip';
  const beats = d.accuracy !== null && d.alwaysBull !== null && d.accuracy > d.alwaysBull;

  return (
    <Panel>
      <div style={{ position: 'relative', zIndex: 4, padding: '28px 28px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="t-title" style={{ margin: 0, fontSize: 18 }}>
                Forward validation
              </h2>
              <MockBadge env={fw} />
            </div>
            <span style={{ fontSize: 14, color: 'var(--mut)' }}>
              Sinyal dinilai setelah minggunya tutup, tidak pernah di-fit ulang{d.start ? ` · sejak ${fmtDay(d.start)}` : ''}
            </span>
          </div>
          <Headline
            value={d.labeled ? pct(d.accuracy) : '—'}
            caption={d.labeled ? `${d.correct} dari ${d.labeled} minggu tepat` : `${d.published} sinyal terbit, belum ada yang dinilai`}
          />
        </div>

        {d.rows.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <OutcomeSquares
              label={`${d.published} sinyal: ${d.correct} tepat, ${d.pending} menunggu`}
              items={[...d.rows].reverse().map((r) => ({
                key: r.as_of,
                outcome: outcomeOf(r),
                title: `${fmtDay(r.as_of)} · ${r.signal}`,
              }))}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 13, color: 'var(--dim)' }}>
              <span>Oranye tepat · cokelat meleset · garis menunggu 7 hari</span>
              {d.alwaysBull !== null ? (
                <span>
                  Pembanding &quot;selalu naik&quot; {pct(d.alwaysBull)}
                  {d.accuracy !== null ? (beats ? ', dikalahkan' : ', belum dikalahkan') : ''}
                </span>
              ) : null}
              <span>{d.enough ? 'Cukup untuk disimpulkan' : `Perlu ≥${MIN_WEEKLY_LABELED} minggu dinilai (sekarang ${d.labeled})`}</span>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 -12px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 12px 8px', fontSize: 13, color: 'var(--dim)', minWidth: 620 }}>
            <span>Minggu</span>
            <span>Sinyal</span>
            <span>Harga awal → akhir</span>
            <span>Gerak 7 hari</span>
            <span style={{ textAlign: 'right' }}>Hasil</span>
          </div>
          {d.rows.slice(0, 8).map((r) => {
            const z = r.realized;
            return (
              <div
                key={r.as_of}
                className="ember-row"
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: 12, fontSize: 15, minWidth: 620 }}
              >
                <span style={{ color: '#e9ddd2' }}>{fmtDay(r.as_of)}</span>
                <span>
                  <b style={{ color: r.signal === 'BULL' ? '#ffb27a' : r.signal === 'BEAR' ? 'var(--down)' : 'var(--mut)' }}>
                    {r.signal === 'BULL' ? 'Bullish' : r.signal === 'BEAR' ? 'Bearish' : 'Tanpa sinyal'}
                  </b>{' '}
                  <span style={{ fontSize: 13, color: 'var(--dim)' }}>{(r.p_up * 100).toFixed(0)}%</span>
                </span>
                <span style={{ color: '#e9ddd2' }}>{z ? `${usd(z.close_as_of)} → ${usd(z.close_end)}` : `sampai ${fmtDay(r.endDate)}`}</span>
                <span style={{ color: z ? (z.return_7d >= 0 ? '#ffb27a' : 'var(--down)') : 'var(--dim)' }}>
                  {z ? `${z.return_7d >= 0 ? '+' : '−'}${Math.abs(z.return_7d * 100).toFixed(1)}%` : '—'}
                </span>
                <ResultTag outcome={outcomeOf(r)} />
              </div>
            );
          })}
        </div>
      </div>
      <SourceFootnote env={fw} />
    </Panel>
  );
}
