import { Panel, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { BUCKET_WORD } from '@/lib/features/monthlyForecast/present';
import { MIN_MONTHLY_PER_HORIZON } from '@/lib/forward/stats';
import { usd } from '@/lib/features/halvingCycle/present';
import { fmtDay } from '@/lib/dates';
import { Headline, OutcomeSquares, ResultTag, pct, type Outcome } from './ui';

/** Where in the 5th..95th band a realised close landed, as a position on the bar (0–100). */
const BUCKET_POS: Record<string, number> = {
  '<p5': 2,
  'p5-p10': 7.5,
  'p10-p25': 17.5,
  'p25-p50': 37.5,
  'p50-p75': 62.5,
  'p75-p90': 82.5,
  'p90-p95': 92.5,
  '>p95': 98,
};
const COLS = 'minmax(90px, 1fr) minmax(90px, 1fr) minmax(90px, 0.9fr) minmax(170px, 1.8fr) 92px';

/**
 * Forward validation of the monthly runs, in the same shape as the weekly card:
 * the headline is the longest horizon's hit rate on the 80% band, one square
 * per scored window, a tile per horizon, and the series as rows with a bar
 * showing where the real close landed inside the band.
 */
export function MonthlyForwardPanel({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const f = fc.data.forward;
  const long = f.horizons[f.horizons.length - 1];
  const outcomeOf = (o: { inside80: boolean } | null): Outcome => (!o ? 'pending' : o.inside80 ? 'hit' : 'miss');

  return (
    <Panel>
      <div style={{ position: 'relative', zIndex: 4, padding: '28px 28px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="t-title" style={{ margin: 0, fontSize: 18 }}>
                Forward validation
              </h2>
              <MockBadge env={fc} />
            </div>
            <span style={{ fontSize: 14, color: 'var(--mut)' }}>
              Apakah harga sungguhan masuk kisaran 80%?{f.start ? ` · sejak ${fmtDay(f.start)} · ${f.runs} run` : ''}
            </span>
          </div>
          <Headline
            value={long.scored ? pct(long.inside80 / long.scored) : '—'}
            caption={long.scored ? `${long.inside80} dari ${long.scored} jendela ${long.h} hari masuk` : `belum ada jendela ${long.h} hari yang lewat`}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OutcomeSquares
            label={`Seri ${long.h} hari: ${long.inside80} masuk dari ${long.scored} dinilai`}
            items={[...long.rows].reverse().map((r) => ({ key: r.asOf, outcome: outcomeOf(r.outcome), title: `${fmtDay(r.asOf)} · D+${long.h}` }))}
          />
          <span style={{ fontSize: 13, color: 'var(--dim)' }}>Oranye masuk kisaran · cokelat keluar · garis belum waktunya</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${f.horizons.length}, minmax(0, 1fr))`, gap: 10 }}>
          {f.horizons.map((h) => (
            <div key={h.h} className="iris-inset" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{h.h} hari</span>
              <span style={{ fontSize: 22, fontWeight: 600 }}>{h.scored ? `${h.inside80}/${h.scored}` : '—'}</span>
              <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>
                {h.scored
                  ? h.expected80
                    ? `wajar ${h.expected80[0]}–${h.expected80[1]}`
                    : 'masuk kisaran 80%'
                  : `${h.inSeries} run menunggu`}
                {h.enough ? '' : ` · perlu ≥${MIN_MONTHLY_PER_HORIZON}`}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 -12px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 12px 8px', fontSize: 13, color: 'var(--dim)', minWidth: 620 }}>
            <span>Dibuat</span>
            <span>Dinilai</span>
            <span>Harga</span>
            <span>Posisi dalam kisaran</span>
            <span style={{ textAlign: 'right' }}>Hasil</span>
          </div>
          {long.rows.slice(0, 8).map((r) => {
            const o = r.outcome;
            const due = new Date(Date.parse(`${r.asOf}T00:00:00Z`) + long.h * 86_400_000).toISOString().slice(0, 10);
            const pos = o ? BUCKET_POS[o.bucket] : null;
            return (
              <div key={r.asOf} className="ember-row" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: 12, fontSize: 15, minWidth: 620 }}>
                <span style={{ color: '#e9ddd2' }}>{fmtDay(r.asOf)}</span>
                <span style={{ color: '#e9ddd2' }}>{fmtDay(o?.date ?? due)}</span>
                <span>{o ? usd(o.close) : '—'}</span>
                <div title={o ? BUCKET_WORD[o.bucket] ?? o.bucket : 'menunggu'} style={{ position: 'relative', height: 14, borderRadius: 999, background: 'var(--sunk)' }}>
                  <span style={{ position: 'absolute', top: 2, bottom: 2, left: '10%', width: '80%', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 30%, var(--line))' }} />
                  {pos !== null && pos !== undefined ? (
                    <span style={{ position: 'absolute', top: -4, height: 22, left: `${pos}%`, width: 3, marginLeft: -1.5, borderRadius: 2, background: '#f6eee7' }} />
                  ) : null}
                </div>
                <ResultTag outcome={outcomeOf(o)} hit="Masuk" miss="Keluar" />
              </div>
            );
          })}
        </div>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
