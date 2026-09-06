import { getFearGreed } from '@/lib/features/fearGreed';
import { getSentiment } from '@/lib/features/sentiment';
import { getNews } from '@/lib/features/news';
import { getGeopoliticalEvents } from '@/lib/features/geopoliticalEvents';
import { getChainFlows } from '@/lib/features/chainFlows';
import { getWhaleEvents } from '@/lib/features/whaleEvents';
import { flowsToGeoEvents } from '@/lib/onchain/flowEvents';
import { AsyncPanel } from '@/components/primitives/AsyncPanel';
import { SentimentStrip } from '@/components/features/sentiment/SentimentStrip';
import { GlobalSentimentPanel } from '@/components/features/events/GlobalSentimentPanel';
import { WhaleWire } from '@/components/features/whale/WhaleWire';

export const revalidate = 30;
const WHALE_LIMIT = 50;

export default function GlobalSentimentPage() {
  const fearGreed = getFearGreed({ limit: 1 });
  const sentiment = getSentiment({ days: 7 });
  const news = getNews({ limit: 400 });
  const events = getGeopoliticalEvents({ limit: 150 });
  const flowData = getChainFlows({ symbol: 'BTC' }).then((flow) => ({
    ...flow, data: flowsToGeoEvents(flow.data.transfers),
  }));
  const whale = getWhaleEvents({ limit: WHALE_LIMIT });
  const summary = Promise.all([fearGreed, sentiment, news, events, whale]);

  return <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
    <AsyncPanel title="Sentiment summary" height={100} data={summary}>
      {([fearGreed, sentiment, news, events, whale]) => <SentimentStrip
        fearGreed={fearGreed} sentiment={sentiment} news={news} events={events} whale={whale} />}
    </AsyncPanel>
    <AsyncPanel title="Global map & news" height={460} data={Promise.all([events, news])}>
      {([events, news]) => <GlobalSentimentPanel events={events} news={news} flowData={flowData} />}
    </AsyncPanel>
    <AsyncPanel title="Whale wire" height={250} data={whale}>
      {(data) => <WhaleWire initial={data} limit={WHALE_LIMIT} />}
    </AsyncPanel>
  </div>;
}
