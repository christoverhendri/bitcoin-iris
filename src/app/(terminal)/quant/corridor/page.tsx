import { LiveOnly } from '@/components/primitives';
import { getPowerLaw } from '@/lib/features/powerLawCorridor';
import { CorridorNow } from '@/components/features/corridor/CorridorNow';
import { CorridorChart } from '@/components/features/corridor/CorridorChart';

/**
 * Same 30 s as the other tabs (the terminal layout's value wins anyway). The
 * Coin Metrics series itself is fetched at most once a day (`coinmetrics.ts`);
 * the walk-forward recompute on top of it runs in memory.
 */
export const revalidate = 30;

export default async function PowerLawPage() {
  const pl = await getPowerLaw({});

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <LiveOnly env={pl} title="POWER-LAW CORRIDOR">
        <CorridorNow pl={pl} />
        <CorridorChart pl={pl} />
      </LiveOnly>
    </div>
  );
}
