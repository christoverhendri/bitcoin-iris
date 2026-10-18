import { LiveOnly } from '@/components/primitives';
import { getChainFlows } from '@/lib/features/chainFlows';
import { ExchangeReservePanel } from '@/components/features/flows/ExchangeReservePanel';
import { NetflowChart } from '@/components/features/flows/NetflowChart';
import { FlowRadar } from '@/components/features/flows/FlowRadar';

export const revalidate = 30;

/**
 * Exchange wallets and transfers (curation 2026-10-18). Each number appears
 * once: cold/hot lives only in the reserve bar, in/out/net only in the netflow
 * chart; the duplicate SUPPLY split and FLOW SUMMARY table were removed.
 */
export default async function WalletsPage() {
  const flows = await getChainFlows({ symbol: 'BTC' });

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Saldo dan transfer besar dari 15 alamat bursa yang dilacak (sampel, bukan seluruh dompet
        bursa). Cold = simpanan jangka panjang, hot = dompet operasional yang siap dipakai. BTC yang
        masuk ke bursa biasanya disiapkan untuk dijual; yang keluar biasanya untuk disimpan.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, minWidth: 0 }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <LiveOnly env={flows} title="EXCHANGE RESERVE">
            <ExchangeReservePanel flows={flows} />
          </LiveOnly>
        </div>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <LiveOnly env={flows} title="EXCHANGE NETFLOW">
            <NetflowChart flows={flows} />
          </LiveOnly>
        </div>
      </div>
      <LiveOnly env={flows} title="FLOW RADAR">
        <FlowRadar flows={flows} />
      </LiveOnly>
    </div>
  );
}
