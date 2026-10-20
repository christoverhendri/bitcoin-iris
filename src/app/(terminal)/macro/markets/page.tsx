import { LiveOnly } from '@/components/primitives';
import { getMacroMarkets } from '@/lib/features/macroMarkets';
import { MarketsTable } from '@/components/features/macroMarkets/MarketsTable';
import { RollingCorrelationCharts } from '@/components/features/macroMarkets/RollingCorrelationCharts';

/** Daily bars upstream; an hour is plenty. */
export const revalidate = 900;

export default async function MacroMarketsPage() {
  const macro = await getMacroMarkets({ range: '1y' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <p className="rise" style={{ ['--i' as string]: 2, margin: '-8px 0 4px', maxWidth: 900, fontSize: 15, lineHeight: 1.6, color: 'var(--mut)' }}>
        Pasar global yang sering memengaruhi BTC: dolar AS, saham AS (S&amp;P 500), indeks
        ketakutan pasar saham (VIX), emas, dan imbal hasil obligasi AS 10 tahun. Dolar dan yield yang
        naik biasanya menekan aset berisiko; saham yang naik biasanya berarti pasar sedang berani
        mengambil risiko. Kolom &quot;vs setahun terakhir&quot; menunjukkan apakah levelnya sekarang
        tinggi atau rendah dibanding kebiasaannya setahun ini; arahkan kursor ke grafik kecil untuk
        tanggal dan nilainya.
      </p>
      <LiveOnly env={macro} title="GLOBAL MARKETS">
        <MarketsTable macro={macro} />
      </LiveOnly>
      <LiveOnly env={macro} title="KORELASI 30 HARI">
        <RollingCorrelationCharts macro={macro} />
      </LiveOnly>
    </div>
  );
}
