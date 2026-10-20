import { LiveOnly } from '@/components/primitives';
import { getSeasonality } from '@/lib/features/seasonality';
import { SeasonalityHeatmap } from '@/components/features/seasonality/SeasonalityHeatmap';
import { SeasonalityNow } from '@/components/features/seasonality/SeasonalityNow';

export const revalidate = 30;

/** The monthly-return table beside the running month's odds and the month-by-month averages. */
export default async function SeasonalityPage() {
  const seasonality = await getSeasonality({ symbol: 'BTC-USD', years: 6 });

  return (
    <section className="ember-split" aria-label="Seasonality">
      <div className="main rise" style={{ ['--i' as string]: 2 }}>
        <LiveOnly env={seasonality} title="MONTHLY RETURN HEATMAP">
          <SeasonalityHeatmap seasonality={seasonality} />
        </LiveOnly>
      </div>
      <div className="side rise" style={{ ['--i' as string]: 3 }}>
        <LiveOnly env={seasonality} title="BULAN INI">
          <SeasonalityNow seasonality={seasonality} />
        </LiveOnly>
      </div>
    </section>
  );
}
