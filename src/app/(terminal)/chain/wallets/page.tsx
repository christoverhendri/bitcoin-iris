import { LiveOnly } from '@/components/primitives';
import { getChainFlows } from '@/lib/features/chainFlows';
import { ExchangeRadar, LargeTransfers, NetflowCard, ReserveHero } from '@/components/features/onchain/OnChainCards';
import { FlowRadar } from '@/components/features/flows/FlowRadar';

export const revalidate = 60;

/** The tracked exchange addresses: what they hold, what moved in and out, and every large transfer. */
export default async function WalletsPage() {
  const flows = await getChainFlows({ symbol: 'BTC' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <LiveOnly env={flows} title="EXCHANGE RESERVE">
        <section className="ember-split" aria-label="Reserves and net flow">
          <div className="main rise" style={{ ['--i' as string]: 2 }}>
            <ReserveHero flows={flows} />
          </div>
          <div className="side rise" style={{ ['--i' as string]: 3 }}>
            <NetflowCard flows={flows} />
          </div>
        </section>
        <section className="ember-split" aria-label="By exchange">
          <div className="main rise" style={{ ['--i' as string]: 4 }}>
            <ExchangeRadar flows={flows} />
          </div>
          <div className="side rise" style={{ ['--i' as string]: 5 }}>
            <LargeTransfers flows={flows} limit={5} />
          </div>
        </section>
        <div className="rise" style={{ ['--i' as string]: 6 }}>
          <FlowRadar flows={flows} />
        </div>
      </LiveOnly>
    </div>
  );
}
