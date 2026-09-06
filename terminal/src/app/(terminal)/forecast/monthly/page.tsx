import { getMonthlyForecast } from '@/lib/features/monthlyForecast';
import { ForecastCone } from '@/components/features/monthly/ForecastCone';
import { PercentileTable } from '@/components/features/monthly/PercentileTable';

export const revalidate = 30;

export default async function MonthlyForecastPage() {
  const [monthlyForecast] = await Promise.all([getMonthlyForecast({ symbol: 'BTC-USD' })]);

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
      <ForecastCone forecast={monthlyForecast} />
      <PercentileTable forecast={monthlyForecast} />
    </div>
  );
}
