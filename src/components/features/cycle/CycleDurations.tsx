import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { HalvingCycleData } from '@/lib/features/halvingCycle';
import type { Interval, Labeled } from '@/lib/quant/cycle';
import { Explain, QTable } from './ui';

interface Row {
  label: string;
  hint: string;
  values: Labeled[];
  iv: Interval | null;
}

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');

/**
 * How long each phase took per cycle, its average, and the 80% range. A row
 * gains a value by itself when the next cycle completes the phase.
 */
export function CycleDurations({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const a = cycle.data.analysis;
  const rows: Row[] = [
    { label: 'Halving → top', hint: 'dari halving sampai puncak', values: a.durations.halvingToTop, iv: a.intervals.halvingToTop },
    { label: 'Top → bottom', hint: 'dari puncak sampai titik terendah', values: a.durations.topToBottom, iv: a.intervals.topToBottom },
    { label: 'Top → top', hint: 'jarak antar puncak', values: a.durations.topToTop, iv: a.intervals.topToTop },
    { label: 'Bottom → top berikutnya', hint: 'dari dasar sampai puncak berikutnya', values: a.durations.bottomToTop, iv: a.intervals.bottomToTop },
  ];

  return (
    <Panel>
      <PanelHeader title="BERAPA LAMA TIAP FASE" note="hari · top & bottom yang sudah diakui" right={<MockBadge env={cycle} />} />
      <Explain>
        <b>Rentang 80%</b> = kalau siklus berikutnya mirip siklus-siklus lalu, 8 dari 10 kemungkinan durasinya ada di rentang ini.
        Rentangnya lebar karena datanya cuma segelintir siklus — itu jawaban jujurnya.
      </Explain>
      <QTable>
        <thead>
          <tr>
            <th>FASE</th>
            <th style={{ textAlign: 'right' }}>TIAP SIKLUS</th>
            <th style={{ textAlign: 'right' }}>RATA-RATA</th>
            <th style={{ textAlign: 'right' }}>RENTANG 80%</th>
            <th>GAMBAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>
                {r.label}
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>{r.hint}</div>
              </td>
              <td style={{ textAlign: 'right' }} title={r.values.map((v) => `siklus ${v.label}: ${n0(v.value)} hari`).join('\n')}>
                {r.values.map((v) => n0(v.value)).join(' · ') || '—'}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.iv ? n0(r.iv.mean) : '—'}</td>
              <td style={{ textAlign: 'right' }}>{r.iv ? `${n0(r.iv.p80[0])}–${n0(r.iv.p80[1])}` : '—'}</td>
              <td>
                <RangeStrip row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </QTable>
      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--dim)' }}>
        Gambar: batang biru = rentang 80%, titik putih = tiap siklus.
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}

function RangeStrip({ row }: { row: Row }) {
  if (!row.iv) return null;
  const W = 160;
  const all = [...row.values.map((v) => v.value), row.iv.p80[0], row.iv.p80[1]];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (v: number) => 4 + ((v - lo) / (hi - lo || 1)) * (W - 8);
  return (
    <svg width={W} height={16} role="img" aria-label={`${row.label}: rentang dan nilai tiap siklus`}>
      <rect x={x(row.iv.p80[0])} y={5} width={x(row.iv.p80[1]) - x(row.iv.p80[0])} height={6} fill="var(--blue)" fillOpacity={0.55} />
      {row.values.map((v) => (
        <circle key={v.label} cx={x(v.value)} cy={8} r={2.5} fill="var(--txt)">
          <title>{`siklus ${v.label}: ${n0(v.value)} hari`}</title>
        </circle>
      ))}
    </svg>
  );
}
