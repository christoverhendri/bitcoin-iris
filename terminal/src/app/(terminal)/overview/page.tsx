import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { getFearGreed } from '@/lib/features/fearGreed';
import { getConfluence } from '@/lib/features/confluence';
import { getBtcSnapshot } from '@/lib/features/snapshot';
import { getOhlcv } from '@/lib/features/ohlcv';
import { getIndicators } from '@/lib/features/indicators';
import { getSentiment } from '@/lib/features/sentiment';
import { getNews } from '@/lib/features/news';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { PanelGrid } from '@/components/primitives';
import { AsyncPanel } from '@/components/primitives/AsyncPanel';
import { SignalCards } from '@/components/features/overview/SignalCards';
import { FearGreedBand } from '@/components/features/overview/FearGreedBand';
import { BtcSnapshotPanel } from '@/components/features/overview/BtcSnapshot';
import { PriceChartLarge } from '@/components/features/market/PriceChartLarge';
import { TechReadout } from '@/components/features/overview/TechReadout';
import { IntelligenceFeed } from '@/components/features/overview/IntelligenceFeed';

export const revalidate = 30;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ tf?: string }> }) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];
  const fearGreed = getFearGreed({ limit: 2 });
  const signals = Promise.all([getWeeklyForecast({ symbol: 'BTC-USD' }), getConfluence({ symbol: 'BTC-USD' }), fearGreed]);
  const snapshot = getBtcSnapshot({ symbol: 'BTC-USD' });
  const candles = getOhlcv({ symbol: 'BTC-USD', interval, limit });
  const indicators = getIndicators({ symbol: 'BTC-USD', interval, limit });
  const intelligence = Promise.all([getSentiment({ days: 7 }), getNews({ limit: 400 })]);

  return <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
    <AsyncPanel title="Market signals" data={signals}>{([weeklyForecast, confluence, fearGreed]) =>
      <SignalCards weeklyForecast={weeklyForecast} confluence={confluence} fearGreed={fearGreed} />
    }</AsyncPanel>
    <AsyncPanel title="Fear & greed" data={fearGreed}>{(data) => <FearGreedBand fearGreed={data} />}</AsyncPanel>
    <PanelGrid className="ov-split" columns="minmax(0, 2fr) minmax(0, 1fr)" style={{ alignItems: 'stretch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <AsyncPanel key={`price-${tf}`} title="Price action" height={350} data={candles}>{(ohlcv) => <PriceChartLarge ohlcv={ohlcv} timeframe={tf} />}</AsyncPanel>
        <AsyncPanel title="News & sentiment" height={300} data={intelligence}>{([sentiment, news]) => <IntelligenceFeed sentiment={sentiment} news={news} />}</AsyncPanel>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <AsyncPanel title="BTC snapshot" height={320} data={snapshot}>{(data) => <BtcSnapshotPanel snapshot={data} />}</AsyncPanel>
        <AsyncPanel key={`technical-${tf}`} title="Technicals" data={indicators}>{(data) => <TechReadout indicators={data} timeframe={tf} />}</AsyncPanel>
      </div>
    </PanelGrid>
  </div>;
}
