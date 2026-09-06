import { getEtfFlows } from '@/lib/features/etfFlows';
import { PanelGrid } from '@/components/primitives';
import { FlowKpis } from '@/components/features/etf/FlowKpis';
import { NetFlowChart } from '@/components/features/etf/NetFlowChart';
import { FundLeaderboard } from '@/components/features/etf/FundLeaderboard';
import { FlowMatrix } from '@/components/features/etf/FlowMatrix';

/** The underlying table updates once a session; anything faster is waste. */
export const revalidate = 1800;

export default async function EtfFlowsPage() {
  const etf = await getEtfFlows({ limit: 10 });

  return (
    <div
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minWidth: 0,
      }}
    >
      <FlowKpis etf={etf} />

      <PanelGrid className="ov-split" columns="minmax(0, 2fr) minmax(0, 1fr)">
        <NetFlowChart etf={etf} />
        <FundLeaderboard etf={etf} />
      </PanelGrid>

      <FlowMatrix etf={etf} />
    </div>
  );
}
