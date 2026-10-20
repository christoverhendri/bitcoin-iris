import Link from 'next/link';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { HalvingCycleData } from '@/lib/features/halvingCycle';
import { CYCLE_METHOD_NOTE, usd } from '@/lib/features/halvingCycle/present';
import { toDay } from '@/lib/quant/daily';
import { fmtDay } from '@/lib/dates';
import { CycleOverlay } from './CycleOverlay';
import { MethodTag } from './ui';

const STATUS_WORD: Record<string, string> = {
  'MENUNGGU TOP': 'Menunggu top',
  'TOP SEMENTARA': 'Top sementara',
  'BOTTOM TERKONFIRMASI': 'Bottom terkonfirmasi',
  'SIKLUS SELESAI': 'Siklus selesai',
};
const PROJ_WORD = { top: 'Top siklus ini', bottom: 'Bottom siklus ini', nextTop: 'Top berikutnya' } as const;

/** Day counts for the running cycle, from the data. */
function position(d: HalvingCycleData) {
  const a = d.analysis;
  const cur = a.current!;
  const h0 = toDay(cur.halving);
  const since = Math.round(toDay(d.today) - h0);
  const total = a.nextHalving ? Math.max(since + 1, Math.round(a.nextHalving.day - h0)) : 1460;
  return { a, cur, h0, since, total };
}

/**
 * The running cycle on one bar: halving on the left, the next halving on the
 * right, each projection's 80% window as a band, the cycle's top if one is in,
 * and today. Positions are day numbers from the analysis.
 */
function Timeline({ d }: { d: HalvingCycleData }) {
  const { a, cur, h0, since, total } = position(d);
  const at = (iso: string) => `${Math.max(0, Math.min(100, ((toDay(iso) - h0) / total) * 100)).toFixed(2)}%`;
  const bands = a.projections.filter((p) => toDay(p.primary.p80[0]) - h0 < total);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative', height: 40 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 15, height: 10, borderRadius: 999, background: 'var(--line)' }} />
        <div
          className="ember-grow"
          style={{
            position: 'absolute',
            left: 0,
            width: `${Math.min(100, (since / total) * 100)}%`,
            top: 15,
            height: 10,
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--accent) 55%, var(--line))',
          }}
        />
        {bands.map((p) => (
          <div
            key={p.key}
            title={`${PROJ_WORD[p.key]}: ${fmtDay(p.primary.center)} (80%: ${fmtDay(p.primary.p80[0])} – ${fmtDay(p.primary.p80[1])})`}
            style={{
              position: 'absolute',
              left: at(p.primary.p80[0]),
              width: `calc(${at(p.primary.p80[1])} - ${at(p.primary.p80[0])})`,
              top: 8,
              height: 24,
              borderRadius: 6,
              background: p.key === 'bottom' ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'color-mix(in srgb, #f6eee7 20%, transparent)',
            }}
          />
        ))}
        {cur.top ? (
          <span
            title={`Top ${fmtDay(cur.top.date)} · ${usd(cur.top.price)}`}
            style={{ position: 'absolute', left: at(cur.top.date), top: 12, width: 16, height: 16, marginLeft: -8, borderRadius: '50%', background: '#e9c4a6' }}
          />
        ) : null}
        <span
          className="iris-pulse"
          title={`Hari ini, hari ke-${since}`}
          style={{
            position: 'absolute',
            left: `${Math.min(100, (since / total) * 100)}%`,
            top: 9,
            width: 22,
            height: 22,
            marginLeft: -11,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: '4px solid #ffd2ae',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: 'var(--dim)', flexWrap: 'wrap' }}>
        <span>
          <b style={{ color: '#e9ddd2', fontWeight: 600 }}>Halving</b> {fmtDay(cur.halving)}
        </span>
        {bands.map((p) => (
          <span key={p.key}>
            <b style={{ color: p.key === 'bottom' ? '#ffb27a' : '#e9ddd2', fontWeight: 600 }}>{PROJ_WORD[p.key]}</b> ±{fmtDay(p.primary.center)}
          </span>
        ))}
        {a.nextHalving ? (
          <span>
            <b style={{ color: '#e9ddd2', fontWeight: 600 }}>Halving berikutnya</b> ±{fmtDay(a.nextHalving.center)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Quant overview card: the day count, the timeline and the overlay, with a link to the full tab. */
export function CyclePreview({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const d = cycle.data;
  const { cur, since, total } = position(d);
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Halving cycle" note={`sejak ${fmtDay(cur.halving)}`} right={<MockBadge env={cycle} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="t-display" style={{ fontSize: 52 }}>
            Hari ke-{since.toLocaleString('en-US')}
          </span>
          <span style={{ fontSize: 15, color: 'var(--mut)' }}>
            dari ±{total.toLocaleString('en-US')} · {Math.round((since / total) * 100)}% · {STATUS_WORD[cur.status] ?? cur.status}
          </span>
        </div>
        <Timeline d={d} />
        <CycleOverlay data={d} height={190} />
        <Link href="/quant/cycle" style={{ fontSize: 14, fontWeight: 600 }}>
          Buka detail siklus →
        </Link>
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}

/** Halving tab hero: the day count set large, the status in words, the timeline. */
export function CycleHero({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const d = cycle.data;
  const { a, cur, since, total } = position(d);
  const proj = a.projections[0];
  return (
    <Panel style={{ height: '100%' }}>
      <div className="ember-halo" aria-hidden="true" style={{ top: -300, right: -200 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>
            Siklus ke-{cur.index} · hari sejak halving {fmtDay(cur.halving)}
            {d.halvingsFromChain ? '' : ' (daftar cadangan)'}
          </h2>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <MethodTag note={CYCLE_METHOD_NOTE} />
            <MockBadge env={cycle} />
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
          <span className="t-display t-accent" style={{ fontSize: 'clamp(72px, 9vw, 112px)', lineHeight: 0.85, color: 'var(--accent)' }}>
            {since.toLocaleString('en-US')}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
            <span className="t-title" style={{ fontSize: 26 }}>
              {STATUS_WORD[cur.status] ?? cur.status}
            </span>
            <span style={{ fontSize: 16, lineHeight: 1.5, color: '#e9ddd2' }}>
              {Math.round((since / total) * 100)}% jalan menuju halving berikutnya
              {proj ? `. ${PROJ_WORD[proj.key]} diperkirakan sekitar ${fmtDay(proj.primary.center)}.` : '.'}
            </span>
          </div>
        </div>
        <Timeline d={d} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {cur.top ? (
            <div className="iris-inset" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{cur.top.kind === 'final' ? 'Top siklus' : 'Top sementara'}</span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{usd(cur.top.price)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>{fmtDay(cur.top.date)}</span>
            </div>
          ) : null}
          {cur.bottom ? (
            <div className="iris-inset" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{cur.bottomConfirmed ? 'Bottom terkonfirmasi' : 'Terendah sejauh ini'}</span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{usd(cur.bottom.price)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>{fmtDay(cur.bottom.date)}</span>
            </div>
          ) : null}
          <div className="iris-inset" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Harga sekarang</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>{usd(d.priceNow)}</span>
            <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>
              {cur.top ? `${(((d.priceNow - cur.top.price) / cur.top.price) * 100).toFixed(1)}% dari top` : fmtDay(d.lastDate)}
            </span>
          </div>
        </div>
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}

/** The countdown to the next halving, from the block height and live block time. */
export function NextHalvingCard({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const d = cycle.data;
  const nh = d.analysis.nextHalving;
  const daysLeft = nh ? Math.max(0, Math.round(nh.day - toDay(d.today))) : null;
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Halving berikutnya" right={<MockBadge env={cycle} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {nh && daysLeft !== null ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="t-display" style={{ fontSize: 64 }}>
                {daysLeft.toLocaleString('en-US')}
              </span>
              <span style={{ fontSize: 18, color: 'var(--mut)' }}>hari lagi</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {(
                [
                  ['Perkiraan', `±${fmtDay(nh.center)}`],
                  ['Blok tersisa', nh.blocksLeft.toLocaleString('en-US')],
                  ['Tinggi blok', nh.height.toLocaleString('en-US')],
                  ['Menit per blok', nh.minutes.used.toFixed(2)],
                ] as const
              ).map(([k, v], i) => (
                <div
                  key={k}
                  className="iris-inset"
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: i === 0 ? 'color-mix(in srgb, var(--accent) 14%, var(--sunk))' : undefined,
                  }}
                >
                  <span style={{ fontSize: 13, color: i === 0 ? '#e9c4a6' : 'var(--dim)' }}>{k}</span>
                  <span style={{ fontSize: 19, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>
              Rentang {fmtDay(nh.range[0])} – {fmtDay(nh.range[1])}, bergeser mengikuti hashrate.
            </span>
          </>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--mut)' }}>Tinggi blok terkini tidak tersedia dari mempool saat ini.</span>
        )}
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}

/** One tile per projection: the centre date, its 80% window, the back-test miss and any flag. */
export function ProjectionTiles({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const a = cycle.data.analysis;
  if (!a.projections.length) return null;
  return (
    <Panel>
      <PanelHeader title="Perkiraan" note={`dari ${a.completed} siklus selesai · rentang 80%`} right={<MockBadge env={cycle} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {a.projections.map((p) => (
          <div key={p.key} className="iris-inset" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>{PROJ_WORD[p.key]}</span>
            <span className="t-title" style={{ fontSize: 28, color: p.key === 'bottom' ? '#ffb27a' : 'var(--txt)' }}>
              ±{fmtDay(p.primary.center)}
            </span>
            <span style={{ fontSize: 14, color: '#e9ddd2' }}>
              {fmtDay(p.primary.p80[0])} – {fmtDay(p.primary.p80[1])}
            </span>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>
              Uji mundur meleset rata-rata {p.primary.avgMissDays ?? '—'} hari · n={p.primary.n}
              {p.cross ? ` · cek silang ±${fmtDay(p.cross.center)}` : ''}
            </span>
            {p.primary.flag ? (
              <span className="chip" style={{ alignSelf: 'flex-start', color: '#e8d5c4', background: '#2a211b' }}>
                {p.primary.flag.charAt(0) + p.primary.flag.slice(1).toLowerCase()}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}

/** The overlay chart as its own card on the Halving tab. */
export function CycleOverlayCard({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  return (
    <Panel>
      <PanelHeader title="Semua siklus, ditumpuk" note="kelipatan harga hari halving · skala log" right={<MockBadge env={cycle} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px' }}>
        <CycleOverlay data={cycle.data} height={300} />
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}
