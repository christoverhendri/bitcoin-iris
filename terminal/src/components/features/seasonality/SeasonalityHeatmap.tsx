import type { ReactNode } from 'react';
import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SeasonalityCell } from '@/lib/features/seasonality';
import { toSeasonalityLabel } from '@/lib/features/seasonality/present';
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

  const monthAvg = MONTHS.map((_, i) => {
    const m = i + 1;
    const vals = years.map((y) => byKey.get(`${y}-${m}`)?.returnPct).filter((x): x is number => x != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  let bestIdx = 0;
  let worstIdx = 0;
  monthAvg.forEach((v, i) => {
    if (v > monthAvg[bestIdx]) bestIdx = i;
    if (v < monthAvg[worstIdx]) worstIdx = i;
  });

  const gridCols = `52px repeat(12, minmax(46px, 1fr))`;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="MONTHLY RETURN HEATMAP"
        note={`${years.length}Y × 12M`}
        right={
          <>
            <Tag label={`BEST ${MONTHS[bestIdx]} ${fmtPct(monthAvg[bestIdx])}`} tone="up" />
            <Tag label={`WORST ${MONTHS[worstIdx]} ${fmtPct(monthAvg[worstIdx])}`} tone="down" />
            <MockBadge env={seasonality} />
          </>
        }
      />
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
                  <DataCell key={i}>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, background: tone, opacity: alpha }} />
                    <span style={{ position: 'relative', color: 'var(--txt)' }}>{toSeasonalityLabel(cell)}</span>
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
        </div>
      </div>
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

function DataCell({ children, strong }: { children?: ReactNode; strong?: boolean }) {
  return (
    <div
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
