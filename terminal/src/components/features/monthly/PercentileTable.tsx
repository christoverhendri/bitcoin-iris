import { Panel, PanelHeader, DataTable, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastPath } from '@/lib/features/monthlyForecast';
import { toMonthlyForecastLabels } from '@/lib/features/monthlyForecast';
import { fmtPct } from '@/lib/format';

export interface PercentileTableProps {
  forecast: Envelope<MonthlyForecastPath>;
}

export function PercentileTable({ forecast }: PercentileTableProps) {
  const f = forecast.data;
  const labels = toMonthlyForecastLabels(f);
  const n = f.pathPct?.length ?? 0;
  const p50ok = f.p50 !== 0;

  const rows = [
    { pct: 'P90', target: labels.p90, delta: p50ok ? (f.p90 / f.p50 - 1) * 100 : null, color: 'var(--up)' },
    { pct: 'P50', target: labels.p50, delta: p50ok ? 0 : null, color: 'var(--blue)' },
    { pct: 'P10', target: labels.p10, delta: p50ok ? (f.p10 / f.p50 - 1) * 100 : null, color: 'var(--down)' },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="PERCENTILE TARGETS"
        note="P25 / P75 not published by model"
        right={<MockBadge env={forecast} />}
      />
      <DataTable>
        <thead>
          <tr>
            <th style={{ color: 'var(--mut)' }}>PERCENTILE</th>
            <th style={{ color: 'var(--mut)' }}>TARGET</th>
            <th style={{ color: 'var(--mut)' }}>Δ VS P50</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pct}>
              <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: r.color }}>{r.pct}</td>
              <td style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{r.target}</td>
              <td style={{ fontFamily: 'var(--mono)', color: 'var(--mut)' }}>
                {r.delta == null ? '—' : fmtPct(r.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <div style={{ borderTop: '1px solid var(--line)' }}>
        <div
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '.12em',
            color: 'var(--mut)',
            padding: '8px 12px 2px',
          }}
        >
          SIMULATION META
        </div>
        <KeyValueRow label="HORIZON" value={n >= 2 ? `${n - 1} days` : '—'} />
        <KeyValueRow label="PERCENTILE BANDS" value="P10 / P50 / P90" />
        <KeyValueRow label="METHOD" value="Random-walk Monte Carlo" />
      </div>
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
