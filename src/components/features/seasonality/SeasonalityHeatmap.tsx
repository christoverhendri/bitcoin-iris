import type { ReactNode } from 'react';
import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SeasonalityCell } from '@/lib/features/seasonality';
import { toSeasonalityLabel } from '@/lib/features/seasonality/present';
import { monthlySummary } from '@/lib/features/seasonality';
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

  // Summary rows use completed months only; the running month is marked BERJALAN.
  const summary = monthlySummary(cells);
  const monthAvg = summary.map((s) => s.mean ?? 0);
  const running = cells.find((c) => c.partial);

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
        Tiap kotak = kenaikan atau penurunan BTC selama satu bulan: harga penutupan terakhir bulan itu dibanding penutupan
        terakhir bulan sebelumnya. Hijau = naik, merah = turun. Kotak bergaris = bulan <b>BERJALAN</b> (sampai data
        terakhir), belum dihitung di baris ringkasan. Baris <b>% TAHUN NAIK</b> = berapa tahun bulan itu ditutup naik dibagi
        jumlah tahunnya — catatan sejarah, bukan jaminan.
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
                  <DataCell key={i} running={cell.partial} title={`${MONTHS[i]} ${y}: ${fmtPct(cell.returnPct)}${cell.partial ? ' · BERJALAN (sampai data terakhir)' : ''}`}>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, background: tone, opacity: alpha }} />
                    <span style={{ position: 'relative', color: 'var(--txt)' }}>{toSeasonalityLabel(cell)}</span>
                    {cell.partial ? (
                      <span style={{ position: 'relative', display: 'block', fontSize: 7, letterSpacing: '.1em', color: 'var(--txt)' }}>BERJALAN</span>
                    ) : null}
                  </DataCell>
                );
              })}
            </Row>
          ))}

          {(['mean', 'median'] as const).map((k) => (
            <Row key={k}>
              <HeadCell>{k === 'mean' ? 'RATA-RATA' : 'MEDIAN'}</HeadCell>
              {summary.map((s) => {
                const v = s[k];
                if (v === null) return <DataCell key={s.month} strong>—</DataCell>;
                const { tone, alpha } = tint(v);
                return (
                  <DataCell key={s.month} strong>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, background: tone, opacity: alpha }} />
                    <span style={{ position: 'relative', color: 'var(--txt)' }}>{fmtPct(v)}</span>
                  </DataCell>
                );
              })}
            </Row>
          ))}

          <Row>
            <HeadCell>% TAHUN NAIK</HeadCell>
            {summary.map((s) => (
              <DataCell key={s.month} strong title={`${MONTHS[s.month - 1]}: naik di ${s.up} dari ${s.n} tahun`}>
                <span style={{ display: 'block', color: s.pctUp === null || s.pctUp === 50 ? 'var(--mut)' : s.pctUp > 50 ? 'var(--up)' : 'var(--down)' }}>
                  {s.pctUp === null ? '—' : `${Math.round(s.pctUp)}%`}
                </span>
                <span style={{ display: 'block', fontSize: 8, fontWeight: 400, color: 'var(--dim)' }}>
                  {s.up}/{s.n} tahun
                </span>
              </DataCell>
            ))}
          </Row>
        </div>
      </div>
      {running ? (
        <div style={{ padding: '0 12px 8px', fontSize: 10.5, color: 'var(--dim)' }}>
          BERJALAN = {MONTHS[running.month - 1]} {running.year} sampai data terakhir; masuk ringkasan begitu bulan berikutnya dimulai.
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

function DataCell({ children, strong, title, running }: { children?: ReactNode; strong?: boolean; title?: string; running?: boolean }) {
  return (
    <div
      title={title}
      style={{
        position: 'relative',
        outline: running ? '1px dashed var(--txt)' : undefined,
        outlineOffset: -2,
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
