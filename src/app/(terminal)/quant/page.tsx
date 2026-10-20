import { LiveOnly } from '@/components/primitives';
import { getSeasonality } from '@/lib/features/seasonality';
import { getHalvingCycle } from '@/lib/features/halvingCycle';
import { getPowerLaw } from '@/lib/features/powerLawCorridor';
import { SeasonalityHeatmap } from '@/components/features/seasonality/SeasonalityHeatmap';
import { SeasonalityNow } from '@/components/features/seasonality/SeasonalityNow';
import { CyclePreview } from '@/components/features/cycle/CycleCards';
import { PowerLawPreview } from '@/components/features/corridor/PowerLawCards';

export const revalidate = 30;

/**
 * Quant overview (the section root): the calendar, the four-year cycle and
 * the power-law lane on one page. Each study has its own tab for the detail.
 */
export default async function QuantOverviewPage() {
  const [seasonality, cycle, pl] = await Promise.all([getSeasonality({ symbol: 'BTC-USD', years: 6 }), getHalvingCycle({}), getPowerLaw({})]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
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
      <section className="ember-row3" aria-label="Cycle and trend">
        <div className="rise" style={{ ['--i' as string]: 4, flex: '1 1 520px' }}>
          <LiveOnly env={cycle} title="SIKLUS HALVING">
            <CyclePreview cycle={cycle} />
          </LiveOnly>
        </div>
        <div className="rise" style={{ ['--i' as string]: 5, flex: '1 1 520px' }}>
          <LiveOnly env={pl} title="POWER-LAW CORRIDOR">
            <PowerLawPreview pl={pl} />
          </LiveOnly>
        </div>
      </section>
    </div>
  );
}
