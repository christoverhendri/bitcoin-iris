import { getSeasonality } from '@/lib/features/seasonality';
import { SeasonalityHeatmap } from '@/components/features/seasonality/SeasonalityHeatmap';

export const revalidate = 30;

export default async function SeasonalityPage() {
  const [seasonality] = await Promise.all([getSeasonality({ symbol: 'BTC-USD', years: 6 })]);

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
      <SeasonalityHeatmap seasonality={seasonality} />
    </div>
  );
}
