import { LiveOnly } from '@/components/primitives';
import { getEtfFlows } from '@/lib/features/etfFlows';
import { getPositioning } from '@/lib/features/positioning';
import { getChainFlows } from '@/lib/features/chainFlows';
import { EtfHero, EtfFunds, LargeTransfers, LongShortMini, ReserveMini } from '@/components/features/onchain/OnChainCards';
import { FlowMatrix } from '@/components/features/etf/FlowMatrix';

/** The ETF table updates once a session; the side cards are cheap re-reads of their own features. */
export const revalidate = 300;

export default async function EtfFlowsPage() {
  const [etf, positioning, flows] = await Promise.all([getEtfFlows({ limit: 10 }), getPositioning({ hours: 48 }), getChainFlows({ symbol: 'BTC' })]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <section className="ember-split" aria-label="ETF flows and positioning">
        <div className="main rise" style={{ ['--i' as string]: 2 }}>
          <LiveOnly env={etf} title="ETF FLOWS">
            <EtfHero etf={etf} />
          </LiveOnly>
        </div>
        <div className="side">
          <div className="rise" style={{ ['--i' as string]: 3 }}>
            <LiveOnly env={positioning} title="LONG / SHORT">
              <LongShortMini positioning={positioning} />
            </LiveOnly>
          </div>
          <div className="rise" style={{ ['--i' as string]: 4, flex: 1 }}>
            <LiveOnly env={flows} title="EXCHANGE RESERVE">
              <ReserveMini flows={flows} />
            </LiveOnly>
          </div>
        </div>
      </section>
      <section className="ember-split" aria-label="Per fund">
        <div className="main rise" style={{ ['--i' as string]: 5 }}>
          <LiveOnly env={etf} title="FLOW MATRIX">
            <FlowMatrix etf={etf} />
          </LiveOnly>
        </div>
        <div className="side rise" style={{ ['--i' as string]: 6 }}>
          <LiveOnly env={etf} title="PER FUND">
            <EtfFunds etf={etf} />
          </LiveOnly>
        </div>
      </section>
      <div className="rise" style={{ ['--i' as string]: 7 }}>
        <LiveOnly env={flows} title="TRANSFER BESAR">
          <LargeTransfers flows={flows} />
        </LiveOnly>
      </div>
    </div>
  );
}
