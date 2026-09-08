import { getMonthlyForecast } from '@/lib/features/monthlyForecast';
import { ForecastCone } from '@/components/features/monthly/ForecastCone';
import { PercentileTable } from '@/components/features/monthly/PercentileTable';
import { connection } from 'next/server';

export default async function MonthlyForecastPage() {
  // The configured file and its freshness must be checked at request time;
  // a prerendered bootstrap page must not bypass the artifact validation gate.
  await connection();
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
