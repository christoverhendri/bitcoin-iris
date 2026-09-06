import {
  Panel,
  PanelHeader,
  DataTable,
  ProgressBar,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PriceDistributionData } from '@/lib/features/priceDistribution';
import { fmtProb, probTone } from '@/lib/features/priceDistribution';
import { fmtUsd, fmtPct } from '@/lib/format';
import { toneVar } from '@/lib/theme/tokens';

/**
 * The distribution restated as the question people actually ask: what are the
 * odds price is above this level by then.
 *
 * These are counts of simulated paths, so they inherit every assumption behind
 * the simulation — including that drift is zero, which is why the probability at
 * spot sits near 50% rather than reflecting any view on direction.
 */
export function ProbabilityTable({ dist }: { dist: Envelope<PriceDistributionData> }) {
  const d = dist.data;
  const rows = d.probabilityLevels;

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="PROBABILITY ABOVE"
        note={`at ${d.horizonLabel} · share of simulated paths`}
        right={<MockBadge env={dist} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>LEVEL</th>
            <th style={{ textAlign: 'right' }}>VS SPOT</th>
            <th style={{ textAlign: 'right' }}>P(ABOVE)</th>
            <th style={{ textAlign: 'left', width: '32%' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const deltaPct = d.spot > 0 ? ((r.price - d.spot) / d.spot) * 100 : 0;
            return (
              <tr key={`${r.price}-${r.label}`}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {fmtUsd(r.price)}
                  <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 8.5 }}>
                    {r.label}
                  </span>
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    color: deltaPct >= 0 ? 'var(--up)' : 'var(--down)',
                  }}
                >
                  {fmtPct(deltaPct, true, 1)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: toneVar(probTone(r.probAbove)),
                  }}
                >
                  {fmtProb(r.probAbove)}
                </td>
                <td>
                  {/* One neutral tone — the bar is a magnitude, not a verdict. */}
                  <ProgressBar pct={r.probAbove * 100} tone="blue" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <SourceFootnote env={dist} />
    </Panel>
  );
}
