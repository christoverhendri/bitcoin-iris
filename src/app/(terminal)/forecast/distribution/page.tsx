import { LiveOnly } from '@/components/primitives';
import { getPriceDistribution } from '@/lib/features/priceDistribution';
import { HORIZON_SPEC, resolveHorizon } from '@/lib/nav';
import { FanChart } from '@/components/features/distribution/FanChart';
import { HorizonTermStructure } from '@/components/features/distribution/HorizonTermStructure';
import { WeeklyMiniCard } from '@/components/features/weekly/WeeklyMiniCard';
import { getWeeklyForecast } from '@/lib/features/weeklyForecast';

/** The simulation is the expensive part; daily closes only move once a day. */
export const revalidate = 900;

/**
 * Curation 2026-10-18: OUTCOME DENSITY, PROBABILITY ABOVE and MODEL STATE were
 * removed; the fan chart and the per-horizon range table remain.
 */
export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const horizon = resolveHorizon((await searchParams).h);
  const [dist, weekly] = await Promise.all([
    getPriceDistribution({ horizonDays: HORIZON_SPEC[horizon].days, nPaths: 4000 }),
    getWeeklyForecast({ symbol: 'BTC-USD' }),
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
      <LiveOnly env={weekly} title="PRAKIRAAN MINGGUAN">
        <WeeklyMiniCard forecast={weekly} />
      </LiveOnly>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Ini bukan ramalan naik atau turun. Model mensimulasikan 4.000 kemungkinan jalur harga dari
        pola gerak BTC selama ini, lalu menunjukkan di kisaran mana harga paling mungkin berakhir.
        Makin jauh jangka waktunya, makin lebar kisarannya.
      </p>
      <LiveOnly env={dist} title="PRICE DISTRIBUTION">
        <FanChart dist={dist} />
      </LiveOnly>
      <LiveOnly env={dist} title="KISARAN HARGA">
        <HorizonTermStructure dist={dist} />
      </LiveOnly>
    </div>
  );
}
