import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { getFearGreed } from '@/lib/features/fearGreed';
import { getConfluence } from '@/lib/features/confluence';
import { getBtcSnapshot } from '@/lib/features/snapshot';
import { getOhlcv } from '@/lib/features/ohlcv';
import { getIndicators } from '@/lib/features/indicators';
import { getSentiment } from '@/lib/features/sentiment';
import { getNews } from '@/lib/features/news';
import { getSocialSentiment } from '@/lib/features/socialSentiment';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { PanelGrid } from '@/components/primitives';
import { SignalCards } from '@/components/features/overview/SignalCards';
import { FearGreedBand } from '@/components/features/overview/FearGreedBand';
import { BtcSnapshotPanel } from '@/components/features/overview/BtcSnapshot';
import { PriceChartLarge } from '@/components/features/market/PriceChartLarge';
import { TechReadout } from '@/components/features/overview/TechReadout';
import { IntelligenceFeed } from '@/components/features/overview/IntelligenceFeed';

export const revalidate = 30;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];

  const [weeklyForecast, fearGreed, confluence, snapshot, ohlcv, indicators, sentiment, newsData, social] =
    await Promise.all([
      getWeeklyForecast({ symbol: 'BTC-USD' }),
      getFearGreed({ limit: 2 }),
      getConfluence({ symbol: 'BTC-USD' }),
      getBtcSnapshot({ symbol: 'BTC-USD' }),
      getOhlcv({ symbol: 'BTC-USD', interval, limit }),
      getIndicators({ symbol: 'BTC-USD', interval, limit }),
      getSentiment({ days: 7 }),
      getNews({ limit: 10 }),
      getSocialSentiment({ days: 30 }),
    ]);

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
      {/* Headline strip: weekly forecast · confluence · social sentiment */}
      <SignalCards weeklyForecast={weeklyForecast} confluence={confluence} social={social} />

      {/* Fear & Greed band */}
      <FearGreedBand fearGreed={fearGreed} />

      {/* Left 2/3: chart + intelligence feed · Right 1/3: snapshot + technicals */}
      <PanelGrid
        className="ov-split"
        columns="minmax(0, 2fr) minmax(0, 1fr)"
        style={{ alignItems: 'stretch' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--line)' }}>
          <PriceChartLarge ohlcv={ohlcv} timeframe={tf} />
          <IntelligenceFeed sentiment={sentiment} news={newsData} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--line)' }}>
          <BtcSnapshotPanel snapshot={snapshot} />
          <TechReadout indicators={indicators} timeframe={tf} />
        </div>
      </PanelGrid>
    </div>
  );
}
