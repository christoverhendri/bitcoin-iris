import { getFearGreed } from '@/lib/features/fearGreed';
import { getSentiment } from '@/lib/features/sentiment';
import { getNews } from '@/lib/features/news';
import { getGeopoliticalEvents } from '@/lib/features/geopoliticalEvents';
import { getChainFlows } from '@/lib/features/chainFlows';
import { getWhaleEvents } from '@/lib/features/whaleEvents';
import { getSocialSentiment } from '@/lib/features/socialSentiment';
import { flowsToGeoEvents } from '@/lib/onchain/flowEvents';
import type { EventCategory } from '@/lib/features/geopoliticalEvents';
import { SentimentStrip } from '@/components/features/sentiment/SentimentStrip';
import { GlobalSentimentPanel } from '@/components/features/events/GlobalSentimentPanel';
import { WhaleWire } from '@/components/features/whale/WhaleWire';
import { SocialSentimentPanel } from '@/components/features/socialSentiment/SocialSentimentPanel';

export const revalidate = 30;

/**
 * Shared by the server fetch and the panel's client poll, so the first paint and
 * every refresh after it hold the same number of rows.
 */
const WHALE_LIMIT = 50;

export default async function GlobalSentimentPage({
  searchParams,
}: {
  searchParams: Promise<{ cats?: string }>;
}) {
  const { cats } = await searchParams;
  const [fearGreed, sentiment, news, newsEvents, flows, whale, social] = await Promise.all([
    getFearGreed({ limit: 1 }),
    getSentiment({ days: 7 }),
    getNews({ limit: 40 }),
    getGeopoliticalEvents({ limit: 150 }),
    getChainFlows({ symbol: 'BTC' }),
    getWhaleEvents({ limit: WHALE_LIMIT }),
    getSocialSentiment({ days: 30 }),
  ]);

  // The two features stay independent readers; they are joined here, at the
  // page, so neither one's failure can take down the other. The WHALE_FLOW
  // markers ride in the same envelope as the headline events so the map, the
  // wire and the layer toggle all treat them as first-class.
  const events = {
    ...newsEvents,
    data: [...newsEvents.data, ...flowsToGeoEvents(flows.data.transfers)],
  };

  const activeCats =
    !cats || cats === 'ALL'
      ? null
      : new Set(cats.split(',').filter(Boolean) as EventCategory[]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <SentimentStrip
        fearGreed={fearGreed}
        sentiment={sentiment}
        news={news}
        events={events}
        whale={whale}
      />
      <SocialSentimentPanel social={social} />
      <GlobalSentimentPanel events={events} news={news} activeCats={activeCats} />
      <WhaleWire initial={whale} limit={WHALE_LIMIT} />
    </div>
  );
}
