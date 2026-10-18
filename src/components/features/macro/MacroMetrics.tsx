import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMetric } from '@/lib/features/macroCountry';
import { toMacroCountryLabels } from '@/lib/features/macroCountry/present';
import { zWords } from '@/lib/zWords';

export interface MacroMetricsProps {
  macro: Envelope<MacroMetric[]>;
  country: string;
  countryLabel: string;
}

const WINDOW = 'vs 2 tahun terakhir';

/**
 * Four US FRED series, each placed against its own last two years in words
 * (curation 2026-10-18: no z / sigma numbers on screen, no ±3σ bars). No
 * colour: "above usual" is a position, not good or bad news.
 */
export function MacroMetrics({ macro, country, countryLabel }: MacroMetricsProps) {
  const m = macro.data.find((x) => x.country === country) ?? macro.data[0];
  const L = toMacroCountryLabels(m);

  const metrics: { key: string; label: string; what: string; value: string; z: number }[] = [
    { key: 'cpi', label: 'CPI INDEX', what: 'Indeks harga konsumen — level, bukan persen; karena terus naik, hampir selalu "di atas"', value: L.cpi, z: m.zScores.cpi },
    { key: 'rate', label: 'POLICY RATE', what: 'Suku bunga The Fed (rata-rata bulanan)', value: L.rate, z: m.zScores.rate },
    { key: 'growth', label: 'GDP GROWTH', what: 'Pertumbuhan ekonomi riil (per kuartal, disetahunkan)', value: L.growth, z: m.zScores.growth },
    { key: 'inflation', label: 'INFLATION', what: 'Inflasi inti per tahun (tanpa makanan & energi)', value: L.inflation, z: m.zScores.inflation },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader title="DATA EKONOMI AS" note={countryLabel} right={<MockBadge env={macro} />} />
      <p style={{ margin: 0, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)', borderBottom: '1px solid var(--line)' }}>
        Empat angka ekonomi utama Amerika Serikat dari FRED (bank sentral AS). Kolom terakhir
        menunjukkan apakah nilainya sedang di atas, sekitar, atau di bawah kebiasaannya selama 2 tahun
        terakhir. Inflasi dan suku bunga yang tinggi biasanya membuat aset berisiko seperti BTC
        lebih tertekan.
      </p>

      <DataTable>
        <thead>
          <tr>
            <th>METRIC</th>
            <th>ARTINYA</th>
            <th>NILAI</th>
            <th>DIBANDING BIASANYA</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((x) => (
            <tr key={x.key}>
              <td style={{ color: 'var(--mut)', fontFamily: 'var(--mono)', fontSize: 10 }}>{x.label}</td>
              <td style={{ fontSize: 11, color: 'var(--mut)' }}>{x.what}</td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700 }}>{x.value}</td>
              <td style={{ fontSize: 11, color: 'var(--txt)' }}>{zWords(x.z, WINDOW)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <SourceFootnote env={macro} />
    </Panel>
  );
}
