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

/** Up months fill with the accent, down months with a warm brown, both by size. */
function tint(returnPct: number): { tone: string; alpha: number; ink: string } {
  const alpha = Math.max(0.12, Math.min(1, Math.abs(returnPct) / 45));
  const ink = returnPct >= 0 && alpha > 0.6 ? '#1a0e06' : 'var(--txt)';
  return { tone: returnPct >= 0 ? 'var(--accent)' : '#6b4a35', alpha, ink };
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
        title="Monthly returns"
        note={`${years[0] ?? ''}–${years[years.length - 1] ?? ''} · ${years.length} tahun`}
        right={
          <>
            <Tag label={`Terbaik ${MONTHS[bestIdx]} ${fmtPct(monthAvg[bestIdx])}`} tone="up" />
            <Tag label={`Terburuk ${MONTHS[worstIdx]} ${fmtPct(monthAvg[worstIdx])}`} tone="down" />
            <MockBadge env={seasonality} />
          </>
        }
      />
      <p style={{ position: 'relative', zIndex: 4, margin: 0, padding: '0 26px', fontSize: 14, color: 'var(--mut)' }}>
        Return tiap bulan, close ke close. Oranye naik, cokelat turun; kotak bergaris = bulan berjalan.
      </p>
      <div style={{ position: 'relative', zIndex: 4, padding: '16px 26px', overflowX: 'auto', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4, minWidth: 640 }}>
          <HeadCell>Tahun</HeadCell>
          {MONTHS.map((m) => (
            <HeadCell key={m}>{m}</HeadCell>
          ))}

          {years.map((y) => (
            <Row key={y}>
              <HeadCell>{`'${String(y).slice(2)}`}</HeadCell>
              {MONTHS.map((_, i) => {
                const cell = byKey.get(`${y}-${i + 1}`);
                if (!cell) return <DataCell key={i} />;
                const { tone, alpha, ink } = tint(cell.returnPct);
                return (
                  <DataCell key={i} running={cell.partial} title={`${MONTHS[i]} ${y}: ${fmtPct(cell.returnPct)}${cell.partial ? ' · BERJALAN (sampai data terakhir)' : ''}`}>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 7, background: tone, opacity: alpha }} />
                    <span style={{ position: 'relative', color: ink }}>{toSeasonalityLabel(cell)}</span>
                    {cell.partial ? (
                      <span style={{ position: 'relative', display: 'block', fontSize: 12, color: ink }}>berjalan</span>
                    ) : null}
                  </DataCell>
                );
              })}
            </Row>
          ))}

          {(['mean', 'median'] as const).map((k) => (
            <Row key={k}>
              <HeadCell>{k === 'mean' ? 'Rata-rata' : 'Median'}</HeadCell>
              {summary.map((s) => {
                const v = s[k];
                if (v === null) return <DataCell key={s.month} strong>—</DataCell>;
                const { tone, alpha, ink } = tint(v);
                return (
                  <DataCell key={s.month} strong>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 7, background: tone, opacity: alpha }} />
                    <span style={{ position: 'relative', color: ink }}>{fmtPct(v)}</span>
                  </DataCell>
                );
              })}
            </Row>
          ))}

          <Row>
            <HeadCell>% tahun naik</HeadCell>
            {summary.map((s) => (
              <DataCell key={s.month} strong title={`${MONTHS[s.month - 1]}: naik di ${s.up} dari ${s.n} tahun`}>
                <span style={{ display: 'block', color: s.pctUp === null || s.pctUp === 50 ? 'var(--mut)' : s.pctUp > 50 ? '#ffb27a' : 'var(--down)' }}>
                  {s.pctUp === null ? '—' : `${Math.round(s.pctUp)}%`}
                </span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: 'var(--dim)' }}>
                  {s.up}/{s.n} tahun
                </span>
              </DataCell>
            ))}
          </Row>
        </div>
      </div>
      {running ? (
        <div style={{ position: 'relative', zIndex: 4, padding: '0 26px 8px', fontSize: 13, color: 'var(--dim)' }}>
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
    <div style={{ padding: '6px 4px', textAlign: 'center', fontSize: 12.5, color: 'var(--dim)', alignSelf: 'center' }}>
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
        outline: running ? '2px dashed var(--txt)' : undefined,
        outlineOffset: -2,
        borderRadius: 7,
        background: strong ? 'var(--raise)' : 'var(--sunk)',
        padding: '8px 4px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: strong ? 700 : 600,
        minWidth: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}
