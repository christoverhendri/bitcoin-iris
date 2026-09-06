import { getPriceDistribution } from '@/lib/features/priceDistribution';
import { HORIZON_SPEC, resolveHorizon } from '@/lib/nav';
import { PanelGrid } from '@/components/primitives';
import { FanChart } from '@/components/features/distribution/FanChart';
import { TerminalDistribution } from '@/components/features/distribution/TerminalDistribution';
import { HorizonTermStructure } from '@/components/features/distribution/HorizonTermStructure';
import { ProbabilityTable } from '@/components/features/distribution/ProbabilityTable';
import { ModelStatePanel } from '@/components/features/distribution/ModelStatePanel';

/** The simulation is the expensive part; daily closes only move once a day. */
export const revalidate = 900;

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const horizon = resolveHorizon((await searchParams).h);
  const dist = await getPriceDistribution({
    horizonDays: HORIZON_SPEC[horizon].days,
    nPaths: 4000,
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
      <PanelGrid className="ov-split" columns="minmax(0, 2.4fr) minmax(0, 1fr)">
        <FanChart dist={dist} />
        <TerminalDistribution dist={dist} />
      </PanelGrid>

      <HorizonTermStructure dist={dist} />

      <PanelGrid className="ov-split" columns="minmax(0, 1fr) minmax(0, 1fr)">
        <ProbabilityTable dist={dist} />
        <ModelStatePanel dist={dist} />
      </PanelGrid>
    </div>
  );
}
