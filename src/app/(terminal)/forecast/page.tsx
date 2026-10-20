import { LiveOnly } from '@/components/primitives';
import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { getMonthlyForecast } from '@/lib/features/monthlyForecast';
import { DirectionCard } from '@/components/features/weekly/DirectionCard';
import { DriverBreakdown } from '@/components/features/weekly/DriverBreakdown';
import { MonthlyPreview } from '@/components/features/monthly/MonthlyPreview';

export const revalidate = 30;

/**
 * Forecast overview (the section root): this week's call beside the 30-day
 * range, then what drives the call. The track records live on the Weekly and
 * Monthly tabs.
 */
export default async function ForecastOverviewPage() {
  const [weeklyForecast, monthly] = await Promise.all([getWeeklyForecast({ symbol: 'BTC-USD' }), getMonthlyForecast({})]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <section className="ember-split" aria-label="This week and the next 30 days">
        <div className="main rise" style={{ ['--i' as string]: 2 }}>
          <LiveOnly env={weeklyForecast} title="WEEKLY FORECAST">
            <DirectionCard forecast={weeklyForecast} />
          </LiveOnly>
        </div>
        <div className="side rise" style={{ ['--i' as string]: 3, flex: '1 1 420px' }}>
          <LiveOnly env={monthly} title="PRAKIRAAN 30 HARI">
            <MonthlyPreview fc={monthly} />
          </LiveOnly>
        </div>
      </section>
      <div className="rise" style={{ ['--i' as string]: 4 }}>
        <LiveOnly env={weeklyForecast} title="DRIVER BREAKDOWN">
          <DriverBreakdown forecast={weeklyForecast} />
        </LiveOnly>
      </div>
    </div>
  );
}
