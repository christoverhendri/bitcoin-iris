import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { DirectionCard } from '@/components/features/weekly/DirectionCard';
import { DriverBreakdown } from '@/components/features/weekly/DriverBreakdown';

export const revalidate = 30;

export default async function WeeklyForecastPage() {
  const [weeklyForecast] = await Promise.all([getWeeklyForecast({ symbol: 'BTC-USD' })]);

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
      <DirectionCard forecast={weeklyForecast} />
      <DriverBreakdown forecast={weeklyForecast} />
    </div>
  );
}
