import { getVolatility } from '@/lib/features/volatility';
import { PanelGrid } from '@/components/primitives';
import { VolKpis } from '@/components/features/volatility/VolKpis';
import { VolHistoryChart } from '@/components/features/volatility/VolHistoryChart';
import { TermStructureGrid } from '@/components/features/volatility/TermStructureGrid';

export const revalidate = 30;

export default async function VolatilityPage() {
  const [volatility] = await Promise.all([getVolatility({ symbol: 'BTC-USD' })]);

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
      <VolKpis volatility={volatility} />
      <PanelGrid columns="repeat(auto-fit, minmax(340px, 1fr))">
        <VolHistoryChart volatility={volatility} />
        <TermStructureGrid volatility={volatility} />
      </PanelGrid>
    </div>
  );
}
