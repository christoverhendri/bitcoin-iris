import { LiveOnly } from '@/components/primitives';
import { getHalvingCycle } from '@/lib/features/halvingCycle';
import { CycleHero, CycleOverlayCard, NextHalvingCard, ProjectionTiles } from '@/components/features/cycle/CycleCards';
import { CycleMap } from '@/components/features/cycle/CycleMap';
import { CycleDurations } from '@/components/features/cycle/CycleDurations';

/**
 * The halving cycle in detail: where the running cycle stands, the countdown,
 * the projections, every cycle stacked, the long log map, and how long each
 * phase lasted. All recomputed from daily prices and block data on render.
 */
export const revalidate = 30;

export default async function HalvingCyclePage() {
  const cycle = await getHalvingCycle({});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <LiveOnly env={cycle} title="SIKLUS HALVING">
        <section className="ember-split" aria-label="The running cycle">
          <div className="main rise" style={{ ['--i' as string]: 2 }}>
            <CycleHero cycle={cycle} />
          </div>
          <div className="side rise" style={{ ['--i' as string]: 3 }}>
            <NextHalvingCard cycle={cycle} />
          </div>
        </section>
        <div className="rise" style={{ ['--i' as string]: 4 }}>
          <ProjectionTiles cycle={cycle} />
        </div>
        <div className="rise" style={{ ['--i' as string]: 5 }}>
          <CycleOverlayCard cycle={cycle} />
        </div>
        <div className="rise" style={{ ['--i' as string]: 6 }}>
          <CycleMap cycle={cycle} />
        </div>
        <div className="rise" style={{ ['--i' as string]: 7 }}>
          <CycleDurations cycle={cycle} />
        </div>
      </LiveOnly>
    </div>
  );
}
