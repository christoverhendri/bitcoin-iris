import { LiveOnly } from '@/components/primitives';
import { getPositioning } from '@/lib/features/positioning';
import { PositioningHero, VenueSpreads } from '@/components/features/onchain/OnChainCards';
import { LongShortChart } from '@/components/features/positioning/LongShortChart';
import { TakerFlowBars } from '@/components/features/positioning/TakerFlowBars';

export const revalidate = 60;

/** Binance futures positioning: the crowd's ratio, the large book, aggression and venue spreads. */
export default async function LongShortPage() {
  const positioning = await getPositioning({ hours: 48 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <LiveOnly env={positioning} title="LONG / SHORT">
        <div className="rise" style={{ ['--i' as string]: 2 }}>
          <PositioningHero positioning={positioning} />
        </div>
        <section className="ember-split" aria-label="Ratio over time and by venue">
          <div className="main rise" style={{ ['--i' as string]: 3 }}>
            <LongShortChart positioning={positioning} />
          </div>
          <div className="side rise" style={{ ['--i' as string]: 4 }}>
            <VenueSpreads positioning={positioning} />
          </div>
        </section>
        <div className="rise" style={{ ['--i' as string]: 5 }}>
          <TakerFlowBars positioning={positioning} />
        </div>
      </LiveOnly>
    </div>
  );
}
