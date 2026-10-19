import { Panel, PanelHeader, PanelStrip, StatTile, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { HalvingCycleData } from '@/lib/features/halvingCycle';
import {
  CYCLE_METHOD_NOTE,
  METHOD_WORDS,
  PROJECTION_LABEL,
  STATUS_TONE,
  fmtDays,
  signedPct,
  usd,
} from '@/lib/features/halvingCycle/present';
import { BOTTOM_CONFIRM_RISE } from '@/lib/quant/config';
import { toDay } from '@/lib/quant/daily';
import { fmtDay } from '@/lib/dates';
import { Explain, MethodTag } from './ui';

/**
 * Status of the running cycle and every number the page projects, each
 * recomputed from the data on render: what is shown depends on the status
 * (waiting for a top → top and chained bottom; provisional top → bottom and
 * next top; confirmed bottom → next top), plus the next halving.
 */
export function CycleOverview({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const d = cycle.data;
  const a = d.analysis;
  const cur = a.current!;
  const today = toDay(d.today);
  const top = cur.top;
  const nh = a.nextHalving;

  const caption = [
    `Berdasarkan ${a.completed} siklus selesai`,
    'rentang 80%',
    `uji mundur: ${a.projections
      .map((p) => `${PROJECTION_LABEL[p.key].replace('PERKIRAAN ', '').toLowerCase()} rata-rata meleset ${p.primary.avgMissDays ?? '—'} hari`)
      .join(', ')}`,
  ].join(' · ');

  return (
    <Panel>
      <PanelHeader
        title="SIKLUS HALVING SEKARANG"
        note={`siklus ke-${cur.index} · halving ${fmtDay(cur.halving)}${d.halvingsFromChain ? '' : ' (daftar cadangan)'}`}
        right={
          <>
            <MethodTag note={CYCLE_METHOD_NOTE} />
            <MockBadge env={cycle} />
          </>
        }
      />
      <Explain>
        Tiap {'±'}4 tahun hadiah penambang dipotong separuh (<b>halving</b>). Sejauh ini harga memuncak (<b>top</b>) lalu jatuh ke titik
        terendah (<b>bottom</b>) dengan jarak waktu yang mirip tiap siklus. Status, top, bottom, dan semua perkiraan di bawah dihitung
        ulang otomatis dari harga harian dan data blok — arahkan kursor ke <b>METODOLOGI</b> untuk definisinya.
      </Explain>

      <div style={{ padding: 12 }}>
        <PanelStrip min={175}>
          <StatTile label="STATUS SIKLUS" value={cur.status} tone={STATUS_TONE[cur.status]} detail={`siklus ke-${cur.index}`} />
          <StatTile label="SEJAK HALVING" value={fmtDays(today - toDay(cur.halving))} detail={`halving ${fmtDay(cur.halving)}`} />
          {top ? (
            <StatTile
              label={top.kind === 'final' ? 'TOP (FINAL)' : 'TOP (SEMENTARA)'}
              value={usd(top.price)}
              tone="down"
              detail={`${fmtDay(top.date)} · harga sekarang ${signedPct(d.priceNow / top.price - 1, 1)}`}
            />
          ) : (
            <StatTile
              label="TOP"
              value="belum ada"
              tone="mut"
              detail={cur.athPending ? `tertinggi sejauh ini ${usd(cur.athPending.price)} (${fmtDay(cur.athPending.date)}), belum turun cukup` : 'belum ada puncak sejak halving'}
            />
          )}
          {cur.bottom ? (
            <StatTile
              label={cur.bottomConfirmed ? 'BOTTOM (TERKONFIRMASI)' : 'TERENDAH SEJAUH INI'}
              value={usd(cur.bottom.price)}
              tone="up"
              detail={`${fmtDay(cur.bottom.date)} · ${
                cur.bottomConfirmed
                  ? `sudah naik ${signedPct(cur.riseFromBottom)}`
                  : `baru naik ${signedPct(cur.riseFromBottom)}, perlu +${Math.round(BOTTOM_CONFIRM_RISE * 100)}%`
              }`}
            />
          ) : null}
          {a.projections.map((p) => (
            <StatTile
              key={p.key}
              label={PROJECTION_LABEL[p.key]}
              value={`±${fmtDay(p.primary.center)}`}
              tone={p.primary.flag ? 'amber' : 'blue'}
              detail={[
                `80%: ${fmtDay(p.primary.p80[0])} – ${fmtDay(p.primary.p80[1])}`,
                p.primary.flag ?? '',
                p.cross ? `cek silang (${METHOD_WORDS[p.cross.method]}): ±${fmtDay(p.cross.center)}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
          {nh ? (
            <StatTile
              label="HALVING BERIKUTNYA"
              value={`±${fmtDay(nh.center)}`}
              tone="amber"
              detail={`${fmtDays(Math.floor(nh.day - today))} lagi · ${nh.blocksLeft.toLocaleString('en-US')} blok · rentang ${fmtDay(nh.range[0])} – ${fmtDay(nh.range[1])}`}
            />
          ) : null}
        </PanelStrip>
      </div>
      <div style={{ padding: '0 12px 10px', fontSize: 10.5, lineHeight: 1.5, color: 'var(--dim)' }}>
        {caption}.{' '}
        {nh
          ? `Waktu blok: ${nh.minutes.used.toFixed(2)} menit${nh.minutes.live !== null ? ' (rata-rata epoch sekarang)' : ''}; rentang dari ${[nh.minutes.live, nh.minutes.lastEpoch, nh.minutes.target]
              .filter((m): m is number => m !== null)
              .map((m) => m.toFixed(2))
              .join(' / ')} menit.`
          : 'Tinggi blok tidak bisa diambil — perkiraan halving tidak ditampilkan.'}
        {d.priceSource !== 'Coin Metrics' ? ` Harga dari sumber cadangan ${d.priceSource}.` : ''}
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}
