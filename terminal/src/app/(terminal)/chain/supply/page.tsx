import { getChainSupply } from '@/lib/features/chainSupply';
import { ActivityKpis } from '@/components/features/supply/ActivityKpis';
import { SupplySplit } from '@/components/features/supply/SupplySplit';

export const revalidate = 30;

export default async function ChainSupplyPage() {
  const [chainSupply] = await Promise.all([getChainSupply({ symbol: 'BTC' })]);

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
      <ActivityKpis supply={chainSupply} />
      <SupplySplit supply={chainSupply} />
    </div>
  );
}
