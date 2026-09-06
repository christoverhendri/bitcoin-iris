import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PositioningData } from '@/lib/features/positioning';
import { TAKER_NOTE } from '@/lib/features/positioning';
import { fmtCompact } from '@/lib/format';

/**
 * Hourly aggressive flow: buy volume minus sell volume.
 *
 * Diverging bars rather than two stacked series, because the question is which
 * side was paying for immediacy — the net is the answer and the components are
 * noise around it.
 */

const W = 800;
const H = 160;
const PAD_X = 10;
const PAD_Y = 14;

export function TakerFlowBars({ positioning }: { positioning: Envelope<PositioningData> }) {
  const d = positioning.data;
  const rows = d.taker;
  const n = rows.length;

  if (n === 0) {
    return (
      <Panel style={{ flex: 1, minWidth: 0 }}>
        <PanelHeader title="TAKER FLOW" right={<MockBadge env={positioning} />} />
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'var(--dim)',
          }}
        >
          Taker series unavailable
        </div>
        <SourceFootnote env={positioning} />
      </Panel>
    );
  }

  const peak = Math.max(...rows.map((r) => Math.abs(r.netVol)), 1);
  const mid = H / 2;
  const half = mid - PAD_Y;
  const slot = (W - PAD_X * 2) / n;
  const barW = Math.max(2, slot * 0.66);

  const last = rows[n - 1];
  const window = rows.reduce(
    (acc, r) => ({ buy: acc.buy + r.buyVol, sell: acc.sell + r.sellVol }),
    { buy: 0, sell: 0 },
  );
  const windowNet = window.buy - window.sell;

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="TAKER FLOW"
        note={`${n}h · buy − sell volume · ratio ${last.ratio.toFixed(3)}`}
        right={<MockBadge env={positioning} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 160, display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          {rows.map((r, i) => {
            const x = PAD_X + i * slot + (slot - barW) / 2;
            const h = (Math.abs(r.netVol) / peak) * half;
            const up = r.netVol >= 0;
            return (
              <rect
                key={r.ts}
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
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            fontFamily: 'var(--mono)',
            fontSize: 9,
          }}
        >
          {(
            [
              ['BUY VOL', fmtCompact(window.buy), 'var(--up)'],
              ['SELL VOL', fmtCompact(window.sell), 'var(--down)'],
              [
                'NET',
                fmtCompact(Math.abs(windowNet)),
                windowNet >= 0 ? 'var(--up)' : 'var(--down)',
              ],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label}>
              <div style={{ fontSize: 8, color: 'var(--mut)', letterSpacing: '.12em' }}>
                {label}
              </div>
              <div style={{ fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
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
          {TAKER_NOTE}
        </p>
      </div>

      <SourceFootnote env={positioning} />
    </Panel>
  );
}
