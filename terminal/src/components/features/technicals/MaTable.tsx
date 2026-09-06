import { Panel, PanelHeader, DataTable, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { IndicatorData } from '@/lib/features/indicators';
import { toIndicatorLabels } from '@/lib/features/indicators/present';
import { fmtPct } from '@/lib/format';
import { signTone } from '@/lib/theme/tokens';

export interface MaTableProps {
  indicators: Envelope<IndicatorData>;
}

export function MaTable({ indicators }: MaTableProps) {
  const d = indicators.data;
  const labels = toIndicatorLabels(d);
  // The indicators feature exposes EMA 5/8/13/21 only (no 50/200) and no spot
  // price on this route — EMA5 stands in as the spot proxy for the vs-price gap.
  const spot = d.ema5;

  const rows: { name: string; value: string; ema: number }[] = [
    { name: 'EMA 5', value: labels.ema5, ema: d.ema5 },
    { name: 'EMA 8', value: labels.ema8, ema: d.ema8 },
    { name: 'EMA 13', value: labels.ema13, ema: d.ema13 },
    { name: 'EMA 21', value: labels.ema21, ema: d.ema21 },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="MOVING AVERAGES"
        note="VS EMA5 (SPOT PROXY)"
        right={<MockBadge env={indicators} />}
      />
      <DataTable>
        <thead>
          <tr>
            <th>MA</th>
            <th>VALUE</th>
            <th>GAP</th>
            <th>POSITION</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gapPct = ((spot - r.ema) / r.ema) * 100;
            const above = spot >= r.ema;
            return (
              <tr key={r.name}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)' }}>{r.name}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt)' }}>{r.value}</td>
                <td
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: `var(--${signTone(gapPct)})`,
                  }}
                >
                  {fmtPct(gapPct)}
                </td>
                <td>
                  <Tag label={above ? 'SPOT ABOVE' : 'SPOT BELOW'} tone={above ? 'up' : 'down'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <SourceFootnote env={indicators} />
    </Panel>
  );
}
