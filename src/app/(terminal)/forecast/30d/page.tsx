import { LiveOnly } from '@/components/primitives';
import { getMonthlyForecast } from '@/lib/features/monthlyForecast';
import { MonthlyFan } from '@/components/features/monthly/MonthlyFan';
import { MonthlyRange } from '@/components/features/monthly/MonthlyRange';
import { MonthlyAccuracy } from '@/components/features/monthly/MonthlyAccuracy';

/**
 * Timothy's 30-day Monte Carlo (motmots/iris-monthly-forecast). Nothing is
 * computed on request: the worker writes one run a week; the 30 s revalidate
 * (the layout's value) only picks a new run up promptly.
 */
export const revalidate = 30;

export default async function MonthlyForecastPage() {
  const fc = await getMonthlyForecast({ trackRecordRuns: 8 });

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <LiveOnly env={fc} title="PRAKIRAAN 30 HARI">
        <MonthlyFan fc={fc} />
        <MonthlyRange fc={fc} />
        <MonthlyAccuracy fc={fc} />
      </LiveOnly>
    </div>
  );
}
