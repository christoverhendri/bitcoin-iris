import { LiveOnly } from '@/components/primitives';
import { getEtfFlows } from '@/lib/features/etfFlows';
import { FlowKpis } from '@/components/features/etf/FlowKpis';
import { NetFlowChart } from '@/components/features/etf/NetFlowChart';
import { FlowMatrix } from '@/components/features/etf/FlowMatrix';

/** The underlying table updates once a session; anything faster is waste. */
export const revalidate = 1800;

export default async function EtfFlowsPage() {
  const etf = await getEtfFlows({ limit: 10 });

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Berapa dolar yang masuk atau keluar dari ETF Bitcoin spot AS tiap sesi. Hijau = uang masuk
        (institusi membeli), merah = keluar. Data settle T+1, jadi sesi terbaru adalah kemarin.
      </p>
      <LiveOnly env={etf} title="ETF FLOWS">
        <FlowKpis etf={etf} />
      </LiveOnly>
      <div style={{ maxWidth: 720, width: '100%' }}>
        <LiveOnly env={etf} title="ETF NET FLOW">
          <NetFlowChart etf={etf} />
        </LiveOnly>
      </div>
      <LiveOnly env={etf} title="FLOW MATRIX">
        <FlowMatrix etf={etf} />
      </LiveOnly>
    </div>
  );
}
