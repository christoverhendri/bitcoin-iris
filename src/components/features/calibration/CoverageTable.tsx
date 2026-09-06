import {
  Panel,
  PanelHeader,
  DataTable,
  DivergingBar,
  Tag,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { CalibrationData } from '@/lib/features/forecastCalibration';
import {
  verdictTone,
  verdictSentence,
  fmtPctPoint,
  CALIBRATION_NOTE,
  OUT_OF_SAMPLE_NOTE,
} from '@/lib/features/forecastCalibration';

/**
 * Did the bands hold?
 *
 * The gap column is the whole panel: nominal minus empirical, signed. Negative
 * means the model was overconfident and reality escaped its bands more often
 * than advertised — the failure mode that matters, because it makes a forecast
 * look more certain than it is.
 */
export function CoverageTable({ cal }: { cal: Envelope<CalibrationData> }) {
  const d = cal.data;
  const maxGap = Math.max(
    ...d.coverage.map((c) => Math.abs(c.empiricalPct - c.nominalPct)),
    10,
  );

  return (
    <Panel>
      <PanelHeader
        title="BAND COVERAGE"
        note={`${d.origins} out-of-sample origins · ${d.horizonLabel} ahead`}
        right={<MockBadge env={cal} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>BAND</th>
            <th style={{ textAlign: 'right' }}>CLAIMED</th>
            <th style={{ textAlign: 'right' }}>ACTUAL</th>
            <th style={{ textAlign: 'right' }}>GAP</th>
            <th style={{ textAlign: 'left', width: '26%' }}>&nbsp;</th>
            <th style={{ textAlign: 'left' }}>VERDICT</th>
          </tr>
        </thead>
        <tbody>
          {d.coverage.map((c) => {
            const gap = c.empiricalPct - c.nominalPct;
            return (
              <tr key={c.nominalPct}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {c.nominalPct === 50
                    ? 'P25–P75'
                    : c.nominalPct === 80
                      ? 'P10–P90'
                      : 'P5–P95'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--mut)' }}>
                  {c.nominalPct}%
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {fmtPctPoint(c.empiricalPct)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    color: Math.abs(gap) <= 7 ? 'var(--mut)' : 'var(--amber)',
                  }}
                >
                  {gap >= 0 ? '+' : ''}
                  {gap.toFixed(1)}
                </td>
                <td>
                  <DivergingBar value={gap} max={maxGap} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Tag label={c.verdict} tone={verdictTone(c.verdict)} />
                  <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 8.5 }}>
                    {verdictSentence(c.verdict, c.nominalPct)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={noteStyle}>{CALIBRATION_NOTE}</p>
        <p style={noteStyle}>{OUT_OF_SAMPLE_NOTE}</p>
      </div>

      <SourceFootnote env={cal} />
    </Panel>
  );
}

const noteStyle = {
  margin: 0,
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  lineHeight: 1.55,
  color: 'var(--dim)',
} as const;
