import { getMarketSnapshot } from '@/lib/getMarketSnapshot';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { MarketReplay } from '@/components/features/market/MarketReplay';
import { getNews } from '@/lib/features/news';
import { getWhaleEvents } from '@/lib/features/whaleEvents';
import type {MarketEvent} from '@/lib/marketSnapshot';

export const revalidate = 30;

export default async function PriceActionPage({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];

  const [news,whales]=await Promise.all([getNews({limit:200}),getWhaleEvents({limit:100})]);
  // Request-time observation watermark, captured once after both event reads.
  // eslint-disable-next-line react-hooks/purity
  const availableAt=Date.now();
  const events:MarketEvent[]=[
    ...(!news.isMock&&!news.unavailable?news.data.filter(a=>/\bETFs?\b/i.test(a.title)&&/\b(?:bitcoin|btc)\b/i.test(a.title)).map(a=>({id:`news:${a.url??a.title}`,ts:a.publishedAt,availableAt,kind:'ETF_NEWS' as const,label:a.title})):[]),
    ...(!whales.isMock&&!whales.unavailable?whales.data.filter(e=>e.symbol==='BTC'&&e.blockchain==='bitcoin').map(e=>({id:`chain:${e.id}`,ts:Date.parse(e.ts),availableAt,kind:'ONCHAIN' as const,label:`${e.amount} BTC · ${e.fromLabel} → ${e.toLabel}`})):[]),
  ];
  const snapshot = await getMarketSnapshot({ symbol: 'BTC-USD', interval, limit });

  return (
    <MarketReplay key={tf} initial={snapshot} timeframe={tf} events={events} />
  );
}
