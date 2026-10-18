import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import { ChartHover } from '@/components/charts/ChartHover';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { fmtUsdM } from '@/lib/features/etfFlows';
import { fmtDay, fmtDayShort } from '@/lib/dates';

/**
 * Daily net creations across every US spot Bitcoin ETF, as a compact card
 * (curation 2026-10-18): a date under every bar, and the session's date and
 * net value on hover.
 *
 * The y-scale is symmetric around zero on `max(|total|)` so a $400M inflow and
 * a $400M outflow are the same height.
 */

const W = 600;
const H = 150;
const PAD_X = 6;
const PAD_Y = 10;

export function NetFlowChart({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  // Oldest on the left, like every other chart in the terminal.
  const rows = [...d.sessions].reverse();
  const n = rows.length;

  if (n === 0) {
    return (
      <Panel>
        <PanelHeader title="ETF NET FLOW PER SESI" right={<MockBadge env={etf} />} />
        <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--dim)' }}>
          Belum ada sesi yang dipublikasikan
        </div>
        <SourceFootnote env={etf} />
      </Panel>
    );
  }

  const peak = Math.max(...rows.map((r) => Math.abs(r.totalUsdM)), 1);
  const mid = H / 2;
  const half = mid - PAD_Y;
  const slot = (W - PAD_X * 2) / n;
  const barW = Math.max(4, slot * 0.6);
  const cx = (i: number) => PAD_X + i * slot + slot / 2;

  const points = rows.map((r, i) => ({
    x: cx(i),
    lines: [fmtDay(r.date), `Net ${fmtUsdM(r.totalUsdM)}`, r.totalUsdM >= 0 ? 'uang masuk' : 'uang keluar'],
  }));

  return (
    <Panel>
      <PanelHeader
        title="ETF NET FLOW PER SESI"
        note={`${n} sesi · US$ juta`}
        right={<MockBadge env={etf} />}
      />
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ChartHover
          viewW={W}
          viewH={H}
          points={points}
          height={H}
          svgStyle={{ background: 'var(--sunk)' }}
          ariaLabel={`ETF net flow, ${n} sesi`}
        >
          {rows.map((r, i) => {
            const h = (Math.abs(r.totalUsdM) / peak) * half;
            const up = r.totalUsdM >= 0;
            return (
              <rect
                key={r.date}
                x={cx(i) - barW / 2}
                y={up ? mid - h : mid}
                width={barW}
                height={Math.max(1, h)}
                fill={up ? 'var(--up)' : 'var(--down)'}
              />
            );
          })}
          <line x1={PAD_X} x2={W - PAD_X} y1={mid} y2={mid} stroke="var(--line2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </ChartHover>

        {/* one date per bar, aligned to the bar centres */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, padding: `0 ${(PAD_X / W) * 100}%` }}>
          {rows.map((r) => (
            <span key={r.date} style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--dim)', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {fmtDayShort(r.date)}
            </span>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--dim)' }}>
          Tinggi bar penuh = ±{fmtUsdM(peak).replace('+', '')} · arahkan kursor ke bar untuk nilainya
        </div>
      </div>
      <SourceFootnote env={etf} />
    </Panel>
  );
}
