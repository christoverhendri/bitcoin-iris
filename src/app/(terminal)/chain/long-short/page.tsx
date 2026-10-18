import { LiveOnly } from '@/components/primitives';
import { getPositioning } from '@/lib/features/positioning';
import { PositioningKpis } from '@/components/features/positioning/PositioningKpis';
import { LongShortChart } from '@/components/features/positioning/LongShortChart';
import { TakerFlowBars } from '@/components/features/positioning/TakerFlowBars';

/** Hourly buckets upstream. */
export const revalidate = 60;

export default async function LongShortPage() {
  const positioning = await getPositioning({ hours: 48 });

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Posisi trader futures BTC di Binance. Rasio long/short di atas 1 berarti lebih banyak yang
        bertaruh harga naik daripada turun. &quot;Retail&quot; dihitung per akun (semua trader sama
        bobotnya), &quot;top trader&quot; dihitung dari ukuran posisi akun-akun terbesar. Taker flow =
        siapa yang lebih agresif: pembeli atau penjual.
      </p>
      <LiveOnly env={positioning} title="LONG / SHORT">
        <PositioningKpis positioning={positioning} />
      </LiveOnly>
      <LiveOnly env={positioning} title="LONG / SHORT CHART">
        <LongShortChart positioning={positioning} />
      </LiveOnly>
      <LiveOnly env={positioning} title="TAKER FLOW">
        <TakerFlowBars positioning={positioning} />
      </LiveOnly>
    </div>
  );
}
