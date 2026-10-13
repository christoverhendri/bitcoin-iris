import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { getFearGreed } from '@/lib/features/fearGreed';
import { getConfluence } from '@/lib/features/confluence';
import { getBtcSnapshot } from '@/lib/features/snapshot';
import { getMarketSnapshot } from '@/lib/getMarketSnapshot';
import { getSentiment } from '@/lib/features/sentiment';
import { getNews } from '@/lib/features/news';
import { getChainNetwork } from '@/lib/features/chainNetwork';
import { getChainFlows } from '@/lib/features/chainFlows';
import { getMacroCountry } from '@/lib/features/macroCountry';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { AsyncPanel } from '@/components/primitives/AsyncPanel';
import { BtcSnapshotPanel } from '@/components/features/overview/BtcSnapshot';
import { PriceChartLarge } from '@/components/features/market/PriceChartLarge';
import { TechReadout } from '@/components/features/overview/TechReadout';
import { IntelligenceFeed } from '@/components/features/overview/IntelligenceFeed';
import { CustomDashboard } from '@/components/features/overview/CustomDashboard';
import { OverviewSummary } from '@/components/features/overview/OverviewSummary';
import { OverviewChain, OverviewMacro, SourceInspector } from '@/components/features/overview/OverviewWidgets';
import { OverviewPriceWidget } from '@/components/features/overview/OverviewPriceWidget';

export const revalidate = 30;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ tf?: string }> }) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];
  const snapshot = getBtcSnapshot({ symbol: 'BTC-USD' });
  const summary = Promise.all([snapshot, getWeeklyForecast({symbol:'BTC-USD'}), getFearGreed({limit:2}), getConfluence({symbol:'BTC-USD'})]);
  const market = getMarketSnapshot({ symbol: 'BTC-USD', interval, limit });
  const candles = market.then(s=>s.ohlcv);
  const indicators = market.then(s=>s.indicators);
  const intelligence = Promise.all([getSentiment({ days: 7 }), getNews({ limit: 400 })]);
  const chain = Promise.all([getChainNetwork({symbol:'BTC'}),getChainFlows({symbol:'BTC'})]);
  const macro = getMacroCountry({countries:['US']});
  return <div className="overview-page">
    <CustomDashboard development={process.env.NODE_ENV === 'development'} summary={<AsyncPanel title="Market summary" data={summary}>{([snapshot,weekly,fear,evidence]) => <OverviewSummary snapshot={snapshot} weekly={weekly} fear={fear} evidence={evidence} />}</AsyncPanel>} widgets={{
      price: <OverviewPriceWidget price={<AsyncPanel key={`price-${tf}`} title="Price action" height={350} data={candles}>{(ohlcv) => <PriceChartLarge ohlcv={ohlcv} timeframe={tf} />}</AsyncPanel>} technicals={<AsyncPanel key={`price-technical-${tf}`} title="Technicals" data={indicators}>{(data) => <TechReadout indicators={data} timeframe={tf} />}</AsyncPanel>} />,
      chain: <AsyncPanel title="On-chain intelligence" data={chain}>{([network,flows]) => <OverviewChain network={network} flows={flows} />}</AsyncPanel>,
      macro: <AsyncPanel title="Macro snapshot" data={macro}>{(data) => <OverviewMacro macro={data} />}</AsyncPanel>,
      evidence: <AsyncPanel title="Recent evidence" data={intelligence}>{([sentiment, news]) => <IntelligenceFeed sentiment={sentiment} news={news} />}</AsyncPanel>,
      snapshot: <AsyncPanel title="BTC snapshot" data={snapshot}>{(data) => <BtcSnapshotPanel snapshot={data} />}</AsyncPanel>,
      technicals: <AsyncPanel key={`technical-${tf}`} title="Technicals" data={indicators}>{(data) => <TechReadout indicators={data} timeframe={tf} />}</AsyncPanel>,
      sources: process.env.NODE_ENV === 'development' ? <SourceInspector /> : null,
    }} />
  </div>;
}
