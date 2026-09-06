import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { fmtUsdM, ETF_WINDOW_NOTE } from '@/lib/features/etfFlows';

/**
 * Daily net creations across every US spot Bitcoin ETF.
 *
 * A diverging column chart, not a line: these are discrete daily settlements,
 * and connecting them would imply a continuous quantity that does not exist —
 * there is no flow at 3am on a Sunday.
 *
 * The y-scale is symmetric around zero on `max(|total|)` so a $400M inflow and
 * a $400M outflow are the same height. An auto-fitted axis would make a quiet
 * week look as dramatic as a violent one, which is the chart lying by scaling.
 */

const W = 800;
const H = 220;
const PAD_X = 10;
const PAD_Y = 18;

export function NetFlowChart({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  // Oldest on the left, like every other chart in the terminal.
  const rows = [...d.sessions].reverse();
  const n = rows.length;

  if (n === 0) {
    return (
      <Panel>
        <PanelHeader title="ETF NET FLOW" right={<MockBadge env={etf} />} />
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'var(--dim)',
          }}
        >
          No sessions published
        </div>
        <SourceFootnote env={etf} />
      </Panel>
    );
  }

  const peak = Math.max(...rows.map((r) => Math.abs(r.totalUsdM)), 1);
  const mid = H / 2;
  const half = mid - PAD_Y;

  const slot = (W - PAD_X * 2) / n;
  const barW = Math.max(3, slot * 0.62);

  return (
    <Panel>
      <PanelHeader
        title="ETF NET FLOW"
        note={`${n} sessions · US$m · newest ${d.latestDate}`}
        right={<MockBadge env={etf} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 220, display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          {/* quarter guides, then the zero axis on top of them */}
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={mid - f * half}
                y2={mid - f * half}
                stroke="var(--line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={mid + f * half}
                y2={mid + f * half}
                stroke="var(--line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {rows.map((r, i) => {
            const x = PAD_X + i * slot + (slot - barW) / 2;
            const h = (Math.abs(r.totalUsdM) / peak) * half;
            const up = r.totalUsdM >= 0;
            return (
              <rect
                key={r.date}
                x={x}
                y={up ? mid - h : mid}
                width={barW}
                height={Math.max(1, h)}
                fill={up ? 'var(--up)' : 'var(--down)'}
              />
            );
          })}

          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={mid}
            y2={mid}
            stroke="var(--line2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 8,
            letterSpacing: '.08em',
            color: 'var(--dim)',
          }}
        >
          <span>{rows[0].date}</span>
          <span>±{fmtUsdM(peak).replace('+', '')} full scale</span>
          <span>{rows[n - 1].date}</span>
        </div>

        <p
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          {ETF_WINDOW_NOTE}
        </p>
      </div>

      <SourceFootnote env={etf} />
    </Panel>
  );
}
