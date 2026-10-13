import { getMarketSnapshot } from '@/lib/getMarketSnapshot';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { PanelGrid } from '@/components/primitives';
import { RsiOscillator } from '@/components/features/technicals/RsiOscillator';
import { MacdHistogram } from '@/components/features/technicals/MacdHistogram';
import { MaTable } from '@/components/features/technicals/MaTable';
import { BollingerState } from '@/components/features/technicals/BollingerState';
import {TechReadout} from '@/components/features/overview/TechReadout';

export const revalidate = 30;

export default async function TechnicalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];
  const snapshot = await getMarketSnapshot({ symbol: 'BTC-USD', interval, limit });
  const {indicators}=snapshot;
  if(indicators.unavailable)return <TechReadout indicators={indicators} timeframe={`${tf} · insufficient eligible history`} />;

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
      <div className="market-snapshot-meta">Snapshot {snapshot.version} · cutoff {new Date(snapshot.cutoff).toISOString()}</div>
      <PanelGrid columns="repeat(auto-fit, minmax(340px, 1fr))">
        <RsiOscillator indicators={indicators} />
        <MacdHistogram indicators={indicators} />
      </PanelGrid>
      <MaTable indicators={indicators} />
      <BollingerState indicators={indicators} />
    </div>
  );
}
