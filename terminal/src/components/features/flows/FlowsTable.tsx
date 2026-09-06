import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainFlowsData } from '@/lib/features/chainFlows';
import { toChainFlowsLabels, getChainFlowsColor } from '@/lib/features/chainFlows';
import { fmtCompact } from '@/lib/format';
import { TRACKED_SUBSET_NOTE } from '@/lib/onchain/exchangeRegistry';

export interface FlowsTableProps {
  flows: Envelope<ChainFlowsData>;
}

export function FlowsTable({ flows }: FlowsTableProps) {
  const f = flows.data;
  const labels = toChainFlowsLabels(f);
  const net = f.outflow - f.inflow;
  const netBtc = `${fmtCompact(net, '')} BTC`;

  const rows = [
    { k: 'INFLOW', v: labels.inflow, color: 'var(--down)' },
    { k: 'OUTFLOW', v: labels.outflow, color: 'var(--up)' },
    { k: 'NET (OUT − IN)', v: netBtc, color: getChainFlowsColor(net) },
    // `cumulative` is netflow (IN − OUT), so positive is the bearish direction —
    // hence the negation before picking a colour.
    { k: 'NETFLOW (IN − OUT)', v: labels.cumulative, color: getChainFlowsColor(-f.cumulative) },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="FLOW SUMMARY"
        note={`${TRACKED_SUBSET_NOTE} · SNAPSHOT · NO HISTORY`}
        right={<MockBadge env={flows} />}
      />
      <DataTable>
        <thead>
          <tr>
            <th style={{ color: 'var(--mut)' }}>FLOW</th>
            <th style={{ color: 'var(--mut)' }}>VALUE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td style={{ fontFamily: 'var(--mono)', color: 'var(--mut)' }}>{r.k}</td>
              <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: r.color }}>{r.v}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <SourceFootnote env={flows} />
    </Panel>
  );
}
