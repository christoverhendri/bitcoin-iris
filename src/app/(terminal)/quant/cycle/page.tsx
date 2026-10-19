import { LiveOnly } from '@/components/primitives';
import { getHalvingCycle } from '@/lib/features/halvingCycle';
import { CycleOverview } from '@/components/features/cycle/CycleOverview';
import { CycleMap } from '@/components/features/cycle/CycleMap';
import { CycleDurations } from '@/components/features/cycle/CycleDurations';

/**
 * Same 30 s as the other tabs (the terminal layout's value wins anyway). The
 * Coin Metrics series itself is fetched at most once a day (`coinmetrics.ts`);
 * the walk-forward recompute on top of it runs in memory.
 */
export const revalidate = 30;

export default async function HalvingCyclePage() {
  const cycle = await getHalvingCycle({});

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <LiveOnly env={cycle} title="SIKLUS HALVING">
        <CycleOverview cycle={cycle} />
        <CycleMap cycle={cycle} />
        <CycleDurations cycle={cycle} />
      </LiveOnly>
    </div>
  );
}
