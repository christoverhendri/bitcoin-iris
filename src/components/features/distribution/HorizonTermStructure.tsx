import {
  Panel,
  PanelHeader,
  DataTable,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PriceDistributionData } from '@/lib/features/priceDistribution';
import {
  toHorizonRow,
  sampleVerdict,
  SAMPLE_NOTE,
} from '@/lib/features/priceDistribution';
import { toneVar } from '@/lib/theme/tokens';

/**
 * Every horizon at once, read off the same simulation as the chart above.
 *
 * All six rows come from one run — the 1M row is literally an intermediate step
 * of the path that produced the 1Y row — so the table cannot contradict itself
 * or the fan chart. Six independent simulations would not have that property.
 *
 * The WINDOWS column is not decoration. It is the number of non-overlapping
 * periods of that length in the history, and it is the honest measure of how
 * much the row is worth.
 */
export function HorizonTermStructure({ dist }: { dist: Envelope<PriceDistributionData> }) {
  const d = dist.data;
  const rows = d.termStructure.map((b) => toHorizonRow(b, d.spot));

  return (
    <Panel>
      <PanelHeader
        title="HORIZON TERM STRUCTURE"
        note={`one simulation · ${d.sampleDays.toLocaleString('en-US')} days of history from ${d.historyStart}`}
        right={<MockBadge env={dist} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>HORIZON</th>
            <th style={{ textAlign: 'right' }}>P5</th>
            <th style={{ textAlign: 'right' }}>P25</th>
            <th style={{ textAlign: 'right' }}>P50</th>
            <th style={{ textAlign: 'right' }}>P75</th>
            <th style={{ textAlign: 'right' }}>P95</th>
            <th style={{ textAlign: 'right' }}>EXP MOVE</th>
            <th style={{ textAlign: 'right' }}>P5–P95</th>
            <th style={{ textAlign: 'right' }}>WINDOWS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = r.days === d.horizonDays;
            return (
              <tr key={r.key} style={active ? { background: 'var(--sunk)' } : undefined}>
                <td style={{ whiteSpace: 'nowrap', color: active ? 'var(--txt)' : undefined }}>
                  {r.key}
                  <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 8.5 }}>
                    {r.days}d
                  </span>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--down)' }}>{r.p5}</td>
                <td style={{ textAlign: 'right', color: 'var(--mut)' }}>{r.p25}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.p50}</td>
                <td style={{ textAlign: 'right', color: 'var(--mut)' }}>{r.p75}</td>
                <td style={{ textAlign: 'right', color: 'var(--up)' }}>{r.p95}</td>
                <td style={{ textAlign: 'right' }}>±{r.expectedMove}</td>
                <td style={{ textAlign: 'right', color: 'var(--mut)' }}>{r.range}</td>
                <td
                  style={{ textAlign: 'right', color: toneVar(r.windowsTone) }}
                  title={sampleVerdict(r.windows)}
                >
                  {r.windows}
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
        {SAMPLE_NOTE}
      </p>

      <SourceFootnote env={dist} />
    </Panel>
  );
}
