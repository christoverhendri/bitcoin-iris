import { getOhlcv } from '@/lib/features/ohlcv';
import { getLevels } from '@/lib/features/levels';
import { TIMEFRAME_SPEC, resolveTimeframe } from '@/lib/nav';
import { PriceChartLarge } from '@/components/features/market/PriceChartLarge';
import { LevelsLadder } from '@/components/features/market/LevelsLadder';

export const revalidate = 30;

export default async function PriceActionPage({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const tf = resolveTimeframe((await searchParams).tf);
  const { interval, limit } = TIMEFRAME_SPEC[tf];

  const [ohlcv, levels] = await Promise.all([
    getOhlcv({ symbol: 'BTC-USD', interval, limit }),
    getLevels({ symbol: 'BTC-USD', interval, limit }),
  ]);

  const candles = ohlcv.data;
  const price = candles[candles.length - 1]?.close ?? 0;

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
      <PriceChartLarge ohlcv={ohlcv} levels={levels} timeframe={tf} />
      <LevelsLadder levels={levels} price={price} />
    </div>
  );
}
