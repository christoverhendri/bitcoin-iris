import { getWeeklyForecast } from '@/lib/features/weeklyForecast';
import { getFearGreed } from '@/lib/features/fearGreed';
import { getConfluence } from '@/lib/features/confluence';
import { getBtcSnapshot } from '@/lib/features/snapshot';
import { getOhlcv } from '@/lib/features/ohlcv';
import { getIndicators } from '@/lib/features/indicators';
import { getSentiment } from '@/lib/features/sentiment';
import { getNews } from '@/lib/features/news';
import { getSocialSentiment } from '@/lib/features/socialSentiment';
import { getGeopoliticalEvents } from '@/lib/features/geopoliticalEvents';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { LiveOnly } from '@/components/primitives';
import { WeeklyForecastCard, ConfluenceCard } from '@/components/features/overview/SignalCards';
import { FearGreedCard } from '@/components/features/overview/FearGreedBand';
import { SocialSentimentCard } from '@/components/features/socialSentiment/SocialSentimentPanel';
import { PriceHero } from '@/components/features/overview/PriceHero';
import { TechReadout } from '@/components/features/overview/TechReadout';
import { WorldEventsCard } from '@/components/features/overview/WorldEventsCard';
import { IntelligenceFeed } from '@/components/features/overview/IntelligenceFeed';

export const revalidate = 30;
export const dynamic = 'force-dynamic';

/**
 * Overview, read top to bottom:
 *   1. the price, and the model's call for the week beside it,
 *   2. the evidence (technicals, the world, the crowd),
 *   3. the headlines behind the mood.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];

  const [weeklyForecast, fearGreed, confluence, snapshot, ohlcv, indicators, sentiment, newsData, social, events] =
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
      getGeopoliticalEvents({ limit: 150 }),
    ]);

  const price = snapshot.isMock ? null : snapshot.data.last;
  const lastClose = ohlcv.isMock || ohlcv.data.length === 0 ? null : ohlcv.data[ohlcv.data.length - 1].close;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <section className="ember-split" aria-label="Price and the model's call">
        <div className="main rise" style={{ ['--i' as string]: 1 }}>
          <LiveOnly env={snapshot} title="BTC PRICE">
            <PriceHero snapshot={snapshot} ohlcv={ohlcv} timeframe={tf} />
          </LiveOnly>
        </div>
        <div className="side">
          <div className="rise" style={{ ['--i' as string]: 2 }}>
            <LiveOnly env={weeklyForecast} title="WEEKLY FORECAST">
              <WeeklyForecastCard weeklyForecast={weeklyForecast} price={price} />
            </LiveOnly>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, flex: 1 }}>
            <div className="rise" style={{ ['--i' as string]: 3, flex: '1 1 170px', minWidth: 0 }}>
              <LiveOnly env={fearGreed} title="FEAR & GREED">
                <FearGreedCard fearGreed={fearGreed} />
              </LiveOnly>
            </div>
            <div className="rise" style={{ ['--i' as string]: 4, flex: '1 1 170px', minWidth: 0 }}>
              <LiveOnly env={confluence} title="CONFLUENCE">
                <ConfluenceCard confluence={confluence} />
              </LiveOnly>
            </div>
          </div>
        </div>
      </section>

      <section className="ember-row3" aria-label="Evidence">
        <div className="rise" style={{ ['--i' as string]: 5 }}>
          <LiveOnly env={indicators} title="TECHNICALS">
            <TechReadout indicators={indicators} timeframe={tf} lastClose={lastClose} />
          </LiveOnly>
        </div>
        <div className="rise" style={{ ['--i' as string]: 6 }}>
          <LiveOnly env={events} title="WORLD EVENTS">
            <WorldEventsCard events={events} />
          </LiveOnly>
        </div>
        <div className="rise" style={{ ['--i' as string]: 7 }}>
          <LiveOnly env={social} title="SOCIAL SENTIMENT">
            <SocialSentimentCard social={social} />
          </LiveOnly>
        </div>
      </section>

      <section className="rise" style={{ ['--i' as string]: 8 }} aria-label="News">
        <LiveOnly env={[sentiment, newsData]} title="LIVE INTELLIGENCE">
          <IntelligenceFeed sentiment={sentiment} news={newsData} />
        </LiveOnly>
      </section>
    </div>
  );
}
