import { getPositioning } from '@/lib/features/positioning';
import { PanelGrid } from '@/components/primitives';
import { PositioningKpis } from '@/components/features/positioning/PositioningKpis';
import { LongShortChart } from '@/components/features/positioning/LongShortChart';
import { TakerFlowBars } from '@/components/features/positioning/TakerFlowBars';
import { PremiumPanel } from '@/components/features/positioning/PremiumPanel';

/** Hourly buckets upstream, but the premium legs move constantly. */
export const revalidate = 60;

export default async function PositioningPage() {
  const positioning = await getPositioning({ hours: 48 });

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
      <PositioningKpis positioning={positioning} />

      <LongShortChart positioning={positioning} />

      <PanelGrid className="ov-split" columns="minmax(0, 2fr) minmax(0, 1fr)">
        <TakerFlowBars positioning={positioning} />
        <PremiumPanel positioning={positioning} />
      </PanelGrid>
    </div>
  );
}
