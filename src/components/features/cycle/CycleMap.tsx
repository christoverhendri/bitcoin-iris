import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import { ChartHover } from '@/components/charts/ChartHover';
import type { Envelope } from '@/lib/envelope';
import type { HalvingCycleData } from '@/lib/features/halvingCycle';
import { PROJECTION_LABEL, usd } from '@/lib/features/halvingCycle/present';
import type { Projection } from '@/lib/quant/cycle';
import { toDay } from '@/lib/quant/daily';
import { fmtDay } from '@/lib/dates';
import { Explain, decadeTicks, logScale, microText, tickUsd, yearTicks } from './ui';

const W = 900;
const H = 320;
const PAD_T = 18;
const PAD_B = 22;
const PAD_R = 50;

const WINDOW_COLOR: Record<Projection['key'], string> = { top: 'var(--down)', bottom: 'var(--blue)', nextTop: 'var(--down)' };

/**
 * Every cycle on one log chart, growing by itself each day: halvings from the
 * chain (amber), tops (red; filled = final, hollow = provisional), bottoms
 * (green; filled = confirmed, hollow = lowest so far), and the 80% window of
 * each active projection. Weekly closes; hover for date and price.
 */
export function CycleMap({ cycle }: { cycle: Envelope<HalvingCycleData> }) {
  const d = cycle.data;
  const a = d.analysis;
  const hist = d.history;
  const d0 = toDay(hist[0].date);
  const ends = [...a.projections.map((p) => p.primary.p80[1]), ...(a.nextHalving ? [a.nextHalving.center] : [])];
  const d1 = Math.max(toDay(d.lastDate), ...ends.map(toDay)) + 45;
  const x = (day: number) => ((day - d0) / (d1 - d0)) * (W - PAD_R);
  const prices = hist.map((p) => p.price);
  const lo = Math.min(...prices) * 0.7;
  const hi = Math.max(...prices) * 1.6;
  const y = logScale(lo, hi, PAD_T, H - PAD_B);
  const path = hist.map((p, i) => `${i ? 'L' : 'M'}${x(toDay(p.date)).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const vline = (iso: string, opacity: number, dash: string) => (
    <line key={iso} x1={x(toDay(iso))} x2={x(toDay(iso))} y1={PAD_T} y2={H - PAD_B} stroke="var(--amber)" strokeOpacity={opacity} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
  );

  return (
    <Panel>
      <PanelHeader
        title="PETA SIKLUS"
        note={`harga penutupan mingguan sejak ${hist[0].date.slice(0, 4)} · skala log`}
        right={
          <>
            <Tag label="TOP" tone="down" />
            <Tag label="BOTTOM" tone="up" />
            <Tag label="HALVING" tone="amber" />
            <MockBadge env={cycle} />
          </>
        }
      />
      <Explain>
        Titik penuh = sudah pasti (top final / bottom terkonfirmasi); titik kosong = masih sementara. Area berwarna = rentang 80%
        perkiraan yang sedang aktif — rentang, bukan tanggal pasti. Garis putus-putus samar = perkiraan halving berikutnya.
      </Explain>
      <div style={{ padding: 12 }}>
        <ChartHover
          viewW={W}
          viewH={H}
          height={320}
          points={hist.map((p) => ({ x: x(toDay(p.date)), y: y(p.price), lines: [fmtDay(p.date), `Harga ${usd(p.price)}`] }))}
          svgStyle={{ background: 'var(--sunk)' }}
          ariaLabel="Harga BTC per siklus halving"
        >
          {decadeTicks(lo, hi).map((p) => (
            <g key={p}>
              <line x1={0} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
              <text x={W - PAD_R + 6} y={y(p) + 3} {...microText} fill="var(--dim)">
                {tickUsd(p)}
              </text>
            </g>
          ))}
          {yearTicks(d0, d1).map((t) => (
            <text key={t.year} x={x(t.day)} y={H - 7} {...microText} fill="var(--dim)" textAnchor={x(t.day) < 20 ? 'start' : 'middle'}>
              {t.year}
            </text>
          ))}
          {a.projections.map((p) => {
            const [from, to] = p.primary.p80.map(toDay);
            return (
              <g key={p.key}>
                <rect x={x(from)} y={PAD_T} width={Math.max(2, x(to) - x(from))} height={H - PAD_T - PAD_B} fill={WINDOW_COLOR[p.key]} fillOpacity={0.14}>
                  <title>{`${PROJECTION_LABEL[p.key]}: 80% ${fmtDay(p.primary.p80[0])} – ${fmtDay(p.primary.p80[1])}`}</title>
                </rect>
                <text x={x(from) + 3} y={PAD_T + 10} {...microText} fill={WINDOW_COLOR[p.key]}>
                  {p.key === 'bottom' ? 'BOTTOM?' : 'TOP?'}
                </text>
              </g>
            );
          })}
          {a.cycles.filter((c) => toDay(c.halving) >= d0).map((c) => vline(c.halving, 1, '4 4'))}
          {a.nextHalving ? vline(a.nextHalving.center, 0.5, '2 5') : null}
          <path d={path} fill="none" stroke="var(--txt)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {a.cycles.map((c) => (
            <g key={c.index}>
              {c.top ? (
                <circle cx={x(toDay(c.top.date))} cy={y(c.top.price)} r={4} fill={c.top.kind === 'final' ? 'var(--down)' : 'none'} stroke="var(--down)" strokeWidth={1.5}>
                  <title>{`Top ${c.top.kind === 'final' ? 'final' : 'sementara'} siklus ${c.index}: ${fmtDay(c.top.date)} · ${usd(c.top.price)}`}</title>
                </circle>
              ) : null}
              {c.bottom ? (
                <circle cx={x(toDay(c.bottom.date))} cy={y(c.bottom.price)} r={4} fill={c.bottomConfirmed ? 'var(--up)' : 'none'} stroke="var(--up)" strokeWidth={1.5}>
                  <title>{`${c.bottomConfirmed ? 'Bottom terkonfirmasi' : 'Terendah sejauh ini'} siklus ${c.index}: ${fmtDay(c.bottom.date)} · ${usd(c.bottom.price)}`}</title>
                </circle>
              ) : null}
            </g>
          ))}
        </ChartHover>
      </div>
      <SourceFootnote env={cycle} />
    </Panel>
  );
}
