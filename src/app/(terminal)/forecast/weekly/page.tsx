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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <section className="ember-split" aria-label="This week">
        <div className="main rise" style={{ ['--i' as string]: 2 }}>
          <LiveOnly env={weeklyForecast} title="WEEKLY FORECAST">
            <DirectionCard forecast={weeklyForecast} />
          </LiveOnly>
        </div>
        <div className="side rise" style={{ ['--i' as string]: 3, flex: '1 1 440px' }}>
          <LiveOnly env={weeklyForecast} title="DRIVER BREAKDOWN">
            <DriverBreakdown forecast={weeklyForecast} />
          </LiveOnly>
        </div>
      </section>
      <div className="rise" style={{ ['--i' as string]: 4 }}>
        <LiveOnly env={weeklyForward} title="FORWARD VALIDATION">
          <WeeklyForwardPanel fw={weeklyForward} />
        </LiveOnly>
      </div>
    </div>
  );
}
