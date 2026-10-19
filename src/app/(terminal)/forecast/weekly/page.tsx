import { LiveOnly } from '@/components/primitives';
import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { DirectionCard } from '@/components/features/weekly/DirectionCard';
import { DriverBreakdown } from '@/components/features/weekly/DriverBreakdown';
import { getWeeklyForward } from '@/lib/features/weeklyForward';
import { WeeklyForwardPanel } from '@/components/features/forward/WeeklyForwardPanel';

export const revalidate = 30;

export default async function WeeklyForecastPage() {
  const [weeklyForecast, weeklyForward] = await Promise.all([getWeeklyForecast({ symbol: 'BTC-USD' }), getWeeklyForward({})]);

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
      <LiveOnly env={weeklyForecast} title="WEEKLY FORECAST">
        <DirectionCard forecast={weeklyForecast} />
      </LiveOnly>
      <LiveOnly env={weeklyForecast} title="DRIVER BREAKDOWN">
        <DriverBreakdown forecast={weeklyForecast} />
      </LiveOnly>
      <LiveOnly env={weeklyForward} title="FORWARD VALIDATION">
        <WeeklyForwardPanel fw={weeklyForward} />
      </LiveOnly>
    </div>
  );
}
