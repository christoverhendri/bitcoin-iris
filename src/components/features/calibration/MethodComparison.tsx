import {
  Panel,
  PanelHeader,
  DataTable,
  Tag,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { CalibrationData } from '@/lib/features/forecastCalibration';
import { fmtPctPoint, PINBALL_NOTE } from '@/lib/features/forecastCalibration';

/**
 * The sophisticated engine against the simple one, on the same origins.
 *
 * This panel exists to be falsifiable. Filtered Historical Simulation is the
 * default because the literature and the reasoning both favour it, but if the
 * plain independent resample scores better on this data then that is what the
 * numbers say and the reader should see it rather than take the choice on faith.
 */
export function MethodComparison({ cal }: { cal: Envelope<CalibrationData> }) {
  const d = cal.data;
  const bestPinball = Math.min(...d.comparison.map((m) => m.pinball));
  // Closest to the 80% the band actually claims — not simply the highest.
  const bestCoverage = d.comparison.reduce(
    (best, m) =>
      Math.abs(m.coverage80 - 80) < Math.abs(best.coverage80 - 80) ? m : best,
    d.comparison[0],
  );

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="ENGINE COMPARISON"
        note={`same ${d.origins} origins · ${d.horizonLabel} ahead`}
        right={<MockBadge env={cal} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>ENGINE</th>
            <th style={{ textAlign: 'right' }}>80% COVERAGE</th>
            <th style={{ textAlign: 'right' }}>PINBALL</th>
            <th style={{ textAlign: 'left' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {d.comparison.map((m) => {
            const gap = m.coverage80 - 80;
            return (
              <tr
                key={m.method}
                style={
                  m.method === d.primaryMethod ? { background: 'var(--sunk)' } : undefined
                }
              >
                <td style={{ whiteSpace: 'nowrap' }}>
                  {m.label}
                  <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 8.5 }}>
                    {m.method}
                  </span>
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: Math.abs(gap) <= 7 ? 'var(--up)' : 'var(--amber)',
                  }}
                >
                  {fmtPctPoint(m.coverage80)}
                </td>
                <td style={{ textAlign: 'right' }}>{m.pinball.toFixed(4)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {m.method === d.primaryMethod ? <Tag label="IN USE" tone="blue" /> : null}
                  {m.pinball === bestPinball ? <Tag label="SHARPEST" tone="up" /> : null}
                  {m === bestCoverage ? <Tag label="BEST COVERAGE" tone="up" /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <p
        style={{
          margin: 0,
          padding: '10px 12px 0',
          fontFamily: 'var(--mono)',
          fontSize: 8.5,
          lineHeight: 1.55,
          color: 'var(--dim)',
        }}
      >
        {PINBALL_NOTE}
      </p>

      <SourceFootnote env={cal} />
    </Panel>
  );
}
