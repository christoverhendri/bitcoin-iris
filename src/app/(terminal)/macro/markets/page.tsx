import { getMacroMarkets } from '@/lib/features/macroMarkets';
import { ZScoreStrip } from '@/components/features/macroMarkets/ZScoreStrip';
import { MarketsTable } from '@/components/features/macroMarkets/MarketsTable';
import { CorrelationBars } from '@/components/features/macroMarkets/CorrelationBars';

/** Daily bars upstream; an hour is plenty. */
export const revalidate = 900;

/**
 * Deliberately NOT country-scoped. The `macro` section carries a `?country=`
 * tab row for the FRED-backed pages, but VIX and the dollar index do not change
 * when you select Japan — so this page ignores the param rather than implying a
 * scoping that does not exist.
 */
export default async function MacroMarketsPage() {
  const macro = await getMacroMarkets({ range: '1y' });

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
      <ZScoreStrip macro={macro} />
      <MarketsTable macro={macro} />
      <CorrelationBars macro={macro} />
    </div>
  );
}
