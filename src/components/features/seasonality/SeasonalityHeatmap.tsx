import type { ReactNode } from 'react';
import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SeasonalityCell } from '@/lib/features/seasonality';
import { toSeasonalityLabel } from '@/lib/features/seasonality/present';
import { monthlyBullOdds } from '@/lib/features/seasonality';
import { fmtPct, MONTHS } from '@/lib/format';

export interface SeasonalityHeatmapProps {
  seasonality: Envelope<SeasonalityCell[]>;
}

function tint(returnPct: number): { tone: string; alpha: number } {
  const alpha = Math.max(0.05, Math.min(0.85, Math.abs(returnPct) / 40));
  return { tone: returnPct >= 0 ? 'var(--up)' : 'var(--down)', alpha };
}

export function SeasonalityHeatmap({ seasonality }: SeasonalityHeatmapProps) {
  const cells = seasonality.data;
  const years = Array.from(new Set(cells.map((c) => c.year))).sort((a, b) => a - b);
  const byKey = new Map(cells.map((c) => [`${c.year}-${c.month}`, c]));

  // Averages and odds use completed months only; the running month is shown with a *.
  const monthAvg = MONTHS.map((_, i) => {
    const m = i + 1;
    const vals = cells.filter((c) => c.month === m && !c.partial).map((c) => c.returnPct);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const odds = monthlyBullOdds(cells);
  const hasPartial = cells.some((c) => c.partial);

  let bestIdx = 0;
  let worstIdx = 0;
  monthAvg.forEach((v, i) => {
    if (v > monthAvg[bestIdx]) bestIdx = i;
    if (v < monthAvg[worstIdx]) worstIdx = i;
  });

  const gridCols = `78px repeat(12, minmax(46px, 1fr))`;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="MONTHLY RETURN HEATMAP"
        note={`${years[0] ?? ''}–${years[years.length - 1] ?? ''} · ${years.length} tahun`}
        right={
          <>
            <Tag label={`BEST ${MONTHS[bestIdx]} ${fmtPct(monthAvg[bestIdx])}`} tone="up" />
            <Tag label={`WORST ${MONTHS[worstIdx]} ${fmtPct(monthAvg[worstIdx])}`} tone="down" />
            <MockBadge env={seasonality} />
          </>
        }
      />
      <p style={{ margin: 0, padding: '10px 12px 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Tiap kotak = kenaikan atau penurunan BTC selama satu bulan (dari harga awal bulan ke harga akhir
        bulan). Hijau = naik, merah = turun. Baris <b>PELUANG NAIK</b> menghitung berapa tahun bulan itu
        ditutup naik dibagi jumlah tahunnya — mis. 7/11 berarti 7 dari 11 tahun naik. Ini catatan
        sejarah, bukan jaminan: tiap bulan hanya punya sekitar 11–12 contoh.
      </p>
      <div style={{ padding: '12px', overflowX: 'auto', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '1px', background: 'var(--line)', border: '1px solid var(--line)', minWidth: 640 }}>
          <HeadCell>YR</HeadCell>
          {MONTHS.map((m) => (
            <HeadCell key={m}>{m}</HeadCell>
          ))}

          {years.map((y) => (
            <Row key={y}>
              <HeadCell>{`'${String(y).slice(2)}`}</HeadCell>
              {MONTHS.map((_, i) => {
                const cell = byKey.get(`${y}-${i + 1}`);
                if (!cell) return <DataCell key={i} />;
                const { tone, alpha } = tint(cell.returnPct);
                return (
                  <DataCell key={i} title={`${MONTHS[i]} ${y}: ${fmtPct(cell.returnPct)}${cell.partial ? ' (bulan berjalan)' : ''}`}>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, background: tone, opacity: alpha }} />
                    <span style={{ position: 'relative', color: 'var(--txt)' }}>
                      {toSeasonalityLabel(cell)}
                      {cell.partial ? '*' : ''}
                    </span>
                  </DataCell>
                );
              })}
            </Row>
          ))}

          <Row>
            <HeadCell>AVG</HeadCell>
            {monthAvg.map((v, i) => {
              const { tone, alpha } = tint(v);
              return (
                <DataCell key={i} strong>
                  <span aria-hidden style={{ position: 'absolute', inset: 0, background: tone, opacity: alpha }} />
                  <span style={{ position: 'relative', color: 'var(--txt)' }}>{fmtPct(v)}</span>
                </DataCell>
              );
            })}
          </Row>

          <Row>
            <HeadCell>PELUANG NAIK</HeadCell>
            {odds.map((o) => (
              <DataCell
                key={o.month}
                strong
                title={`${MONTHS[o.month - 1]}: naik di ${o.bull} dari ${o.total} tahun`}
              >
                <span style={{ display: 'block', color: o.pct === null || o.pct === 50 ? 'var(--mut)' : o.pct > 50 ? 'var(--up)' : 'var(--down)' }}>
                  {o.pct === null ? '—' : `${Math.round(o.pct)}%`}
                </span>
                <span style={{ display: 'block', fontSize: 8, fontWeight: 400, color: 'var(--dim)' }}>
                  {o.bull}/{o.total}
                </span>
              </DataCell>
            ))}
          </Row>
        </div>
      </div>
      {hasPartial ? (
        <div style={{ padding: '0 12px 8px', fontSize: 10.5, color: 'var(--dim)' }}>
          * bulan yang masih berjalan — belum dihitung di rata-rata dan peluang.
        </div>
      ) : null}
      <SourceFootnote env={seasonality} />
    </Panel>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function HeadCell({ children }: { children?: ReactNode }) {
  return (
    <div
      className="iris-micro"
      style={{
        background: 'var(--sunk)',
        padding: '7px 4px',
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.08em',
        color: 'var(--mut)',
      }}
    >
      {children}
    </div>
  );
}

function DataCell({ children, strong, title }: { children?: ReactNode; strong?: boolean; title?: string }) {
  return (
    <div
      title={title}
      style={{
        position: 'relative',
        background: 'var(--panel)',
        padding: '7px 4px',
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 9,
        fontWeight: strong ? 700 : 500,
        minWidth: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}
