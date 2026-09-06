import { getChainFlows } from '@/lib/features/chainFlows';
import { ExchangeReservePanel } from '@/components/features/flows/ExchangeReservePanel';
import { FlowRadar } from '@/components/features/flows/FlowRadar';
import { NetflowChart } from '@/components/features/flows/NetflowChart';
import { FlowsTable } from '@/components/features/flows/FlowsTable';

export const revalidate = 30;

export default async function ChainFlowsPage() {
  const chainFlows = await getChainFlows({ symbol: 'BTC' });

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
      <ExchangeReservePanel flows={chainFlows} />
      <FlowRadar flows={chainFlows} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, minWidth: 0 }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <NetflowChart flows={chainFlows} />
        </div>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <FlowsTable flows={chainFlows} />
        </div>
      </div>
    </div>
  );
}
