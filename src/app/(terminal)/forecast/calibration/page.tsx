import { getForecastCalibration } from '@/lib/features/forecastCalibration';
import { HORIZON_SPEC, resolveHorizon } from '@/lib/nav';
import { PanelGrid } from '@/components/primitives';
import { CoverageTable } from '@/components/features/calibration/CoverageTable';
import { PitHistogram } from '@/components/features/calibration/PitHistogram';
import { MethodComparison } from '@/components/features/calibration/MethodComparison';

/** A hundred-odd simulations; the inputs move once a day. */
export const revalidate = 3600;

export default async function CalibrationPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const horizon = resolveHorizon((await searchParams).h);
  const cal = await getForecastCalibration({
    horizonDays: HORIZON_SPEC[horizon].days,
    nPaths: 600,
  });

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
      <CoverageTable cal={cal} />

      <PanelGrid className="ov-split" columns="minmax(0, 1.4fr) minmax(0, 1fr)">
        <PitHistogram cal={cal} />
        <MethodComparison cal={cal} />
      </PanelGrid>
    </div>
  );
}
