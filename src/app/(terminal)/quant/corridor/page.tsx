import { LiveOnly } from '@/components/primitives';
import { getPowerLaw } from '@/lib/features/powerLawCorridor';
import { PowerLawHero, PowerLawLadder } from '@/components/features/corridor/PowerLawCards';
import { CorridorChart } from '@/components/features/corridor/CorridorChart';

/** The power-law lane: where the price sits today, today's bands, and the long chart. */
export const revalidate = 30;

export default async function PowerLawPage() {
  const pl = await getPowerLaw({});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <LiveOnly env={pl} title="POWER-LAW CORRIDOR">
        <section className="ember-split" aria-label="Today in the corridor">
          <div className="main rise" style={{ ['--i' as string]: 2 }}>
            <PowerLawHero pl={pl} />
          </div>
          <div className="side rise" style={{ ['--i' as string]: 3 }}>
            <PowerLawLadder pl={pl} />
          </div>
        </section>
        <div className="rise" style={{ ['--i' as string]: 4 }}>
          <CorridorChart pl={pl} />
        </div>
      </LiveOnly>
    </div>
  );
}
