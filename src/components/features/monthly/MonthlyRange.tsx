import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { RANGE_COLS, fmtSignedPct, ladderRows, pctVsSpot } from '@/lib/features/monthlyForecast/present';
import { fmtDay } from '@/lib/dates';
import { usd as fmtUsd } from '@/lib/features/halvingCycle/present';

/** The simulated range read off at D+1 / 7 / 14 / 21 / 30, with the same plain names as the Distribution page. */
export function MonthlyRange({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  return (
    <Panel>
      <PanelHeader title="KISARAN HARGA PER HARI" note={`dari harga ${fmtUsd(d.spot)} (${fmtDay(d.asOf)})`} right={<MockBadge env={fc} />} />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>
        <DataTable>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>HARI KE</th>
              {RANGE_COLS.map((c) => (
                <th key={c.key} style={{ textAlign: 'right' }} title={c.title}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ladderRows(d).map((b) => (
              <tr key={b.step}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  D+{b.step} <span style={{ color: 'var(--dim)' }}>{fmtDay(b.date)}</span>
                </td>
                {RANGE_COLS.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                      fontWeight: c.key === 'p50' ? 700 : 400,
                      color: c.key === 'p5' ? 'var(--down)' : c.key === 'p95' ? 'var(--up)' : c.key === 'p50' ? 'var(--txt)' : 'var(--mut)',
                    }}
                  >
                    {fmtUsd(b[c.key])}
                    <span style={{ display: 'block', fontSize: 8.5, color: 'var(--dim)' }}>{fmtSignedPct(pctVsSpot(b[c.key], d.spot))}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <p style={{ margin: 0, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Cara baca: separuh jalur simulasi berakhir antara <b>Rendah</b> dan <b>Tinggi</b>; 9 dari 10 antara <b>Sangat rendah</b>{' '}
        dan <b>Sangat tinggi</b>. Makin jauh harinya, makin lebar kisarannya.
      </p>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
