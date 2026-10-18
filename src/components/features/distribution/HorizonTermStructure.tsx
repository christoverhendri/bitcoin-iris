import {
  Panel,
  PanelHeader,
  DataTable,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PriceDistributionData } from '@/lib/features/priceDistribution';
import { toHorizonRow } from '@/lib/features/priceDistribution';

/**
 * Every horizon at once, read off the same simulation as the chart above, in
 * plain words (curation 2026-10-18): percentile labels became "how many
 * simulated paths end below this", and the WINDOWS column was removed.
 *
 * Column mapping, for the record: SANGAT RENDAH = P5, RENDAH = P25,
 * TENGAH = P50, TINGGI = P75, SANGAT TINGGI = P95.
 */
const COLS: { key: 'p5' | 'p25' | 'p50' | 'p75' | 'p95'; label: string; title: string; color?: string }[] = [
  { key: 'p5', label: 'SANGAT RENDAH', title: 'Hanya 5 dari 100 simulasi berakhir di bawah harga ini', color: 'var(--down)' },
  { key: 'p25', label: 'RENDAH', title: '25 dari 100 simulasi berakhir di bawah harga ini', color: 'var(--mut)' },
  { key: 'p50', label: 'TENGAH', title: 'Separuh simulasi di bawah, separuh di atas harga ini' },
  { key: 'p75', label: 'TINGGI', title: '25 dari 100 simulasi berakhir di atas harga ini', color: 'var(--mut)' },
  { key: 'p95', label: 'SANGAT TINGGI', title: 'Hanya 5 dari 100 simulasi berakhir di atas harga ini', color: 'var(--up)' },
];

export function HorizonTermStructure({ dist }: { dist: Envelope<PriceDistributionData> }) {
  const d = dist.data;
  const rows = d.termStructure.map((b) => toHorizonRow(b, d.spot));

  return (
    <Panel>
      <PanelHeader
        title="KISARAN HARGA PER JANGKA WAKTU"
        note={`satu simulasi · ${d.sampleDays.toLocaleString('en-US')} hari data sejak ${d.historyStart}`}
        right={<MockBadge env={dist} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>JANGKA WAKTU</th>
            {COLS.map((c) => (
              <th key={c.key} style={{ textAlign: 'right' }} title={c.title}>
                {c.label}
              </th>
            ))}
            <th style={{ textAlign: 'right' }} title="Setengah lebar kisaran Rendah–Tinggi, dalam % dari harga sekarang">
              GERAK UMUM
            </th>
            <th style={{ textAlign: 'right' }} title="Jarak Sangat rendah ke Sangat tinggi, dalam % dari harga sekarang">
              LEBAR 90%
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = r.days === d.horizonDays;
            return (
              <tr key={r.key} style={active ? { background: 'var(--sunk)' } : undefined}>
                <td style={{ whiteSpace: 'nowrap', color: active ? 'var(--txt)' : undefined }}>{r.label}</td>
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    style={{ textAlign: 'right', color: c.color, fontWeight: c.key === 'p50' ? 700 : undefined }}
                  >
                    {r[c.key]}
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>±{r.expectedMove}</td>
                <td style={{ textAlign: 'right', color: 'var(--mut)' }}>{r.range}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <p style={{ margin: 0, padding: '10px 12px 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)' }}>
        Cara baca: separuh simulasi berakhir antara <b>Rendah</b> dan <b>Tinggi</b>; 9 dari 10
        berakhir antara <b>Sangat rendah</b> dan <b>Sangat tinggi</b>. <b>Gerak umum</b> = seberapa
        jauh harga biasanya bergerak dari sekarang. Jangka panjang (6 bulan, 1 tahun) didasarkan pada
        lebih sedikit contoh di sejarah, jadi anggap sebagai gambaran kasar.
      </p>

      <SourceFootnote env={dist} />
    </Panel>
  );
}
