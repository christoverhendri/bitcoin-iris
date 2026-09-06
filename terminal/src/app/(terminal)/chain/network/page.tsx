import { getChainNetwork } from '@/lib/features/chainNetwork';
import { FeeStrip } from '@/components/features/network/FeeStrip';
import { MempoolGauge } from '@/components/features/network/MempoolGauge';
import { DifficultyCard } from '@/components/features/network/DifficultyCard';
import { HashrateChart } from '@/components/features/network/HashrateChart';
import { PoolTable } from '@/components/features/network/PoolTable';

export const revalidate = 30;

export default async function ChainNetworkPage() {
  const network = await getChainNetwork({ symbol: 'BTC' });

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
      <FeeStrip network={network} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, minWidth: 0 }}>
        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex' }}>
          <MempoolGauge network={network} />
        </div>
        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex' }}>
          <DifficultyCard network={network} />
        </div>
      </div>

      <HashrateChart network={network} />
      <PoolTable network={network} />
    </div>
  );
}
