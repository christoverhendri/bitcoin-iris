import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import { ChartHover } from '@/components/charts/ChartHover';
import { fmtHour } from '@/lib/dates';
import type { Envelope } from '@/lib/envelope';
import type { PositioningData } from '@/lib/features/positioning';
import { CROWDING_NOTE, SINGLE_VENUE_NOTE } from '@/lib/features/positioning';

/**
 * Retail against the large book, on one shared scale.
 *
 * The shared y-axis is the whole point: these two lines exist to be compared,
 * and giving each its own scale would show two cohorts moving in lockstep even
 * when one sits at 1.05 and the other at 2.10. The 1.0 reference line marks
 * balanced — above it a cohort is net long.
 */

const W = 800;
const H = 200;
const PAD_X = 10;
const PAD_Y = 14;

export function LongShortChart({ positioning }: { positioning: Envelope<PositioningData> }) {
  const d = positioning.data;
  const both = [...d.retail, ...d.topTrader];

  if (both.length === 0) {
    return (
      <Panel style={{ flex: 1, minWidth: 0 }}>
        <PanelHeader title="LONG / SHORT" right={<MockBadge env={positioning} />} />
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'var(--dim)',
          }}
        >
          Binance positioning unavailable
        </div>
        <SourceFootnote env={positioning} />
      </Panel>
    );
  }

  // Always include 1.0 so "balanced" is on screen even in a one-sided window.
  const values = [...both.map((p) => p.ratio), 1];
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = hi - lo || 1;

  const path = (pts: { ratio: number }[]) => {
    const n = pts.length;
    if (n === 0) return '';
    return pts
      .map((p, i) => {
        const x = PAD_X + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2));
        const y = H - PAD_Y - ((p.ratio - lo) / span) * (H - PAD_Y * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const yOne = H - PAD_Y - ((1 - lo) / span) * (H - PAD_Y * 2);

  // Hover: one point per hour, read from the retail series (both share Binance's
  // hourly timestamps); the top-trader value is matched by timestamp.
  const n = d.retail.length;
  const topByTs = new Map(d.topTrader.map((p) => [p.ts, p.ratio]));
  const hoverPoints = d.retail.map((p, i) => {
    const top = topByTs.get(p.ts);
    return {
      x: PAD_X + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2)),
      y: H - PAD_Y - ((p.ratio - lo) / span) * (H - PAD_Y * 2),
      lines: [
        fmtHour(p.ts),
        `Retail ${p.ratio.toFixed(3)}`,
        top === undefined ? 'Top trader —' : `Top trader ${top.toFixed(3)}`,
      ],
    };
  });

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="LONG / SHORT"
        note={`${d.retail.length}h hourly · Binance futures`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag label="RETAIL" tone="blue" />
            <Tag label="TOP TRADERS" tone="purple" />
            <MockBadge env={positioning} />
          </div>
        }
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ChartHover
          viewW={W}
          viewH={H}
          points={hoverPoints}
          height={200}
          svgStyle={{ background: 'var(--sunk)' }}
          ariaLabel="Rasio long/short retail dan top trader, per jam"
        >
          {/* balanced reference */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={yOne}
            y2={yOne}
            stroke="var(--line2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path(d.retail)}
            fill="none"
            stroke="var(--blue)"
            strokeWidth={1}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path(d.topTrader)}
            fill="none"
            stroke="var(--purple)"
            strokeWidth={1}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
        </ChartHover>

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
          <span>{n > 0 ? fmtHour(d.retail[0].ts) : ''}</span>
          <span>garis = 1.00 (seimbang) · skala {lo.toFixed(2)}–{hi.toFixed(2)}</span>
          <span>{n > 0 ? fmtHour(d.retail[n - 1].ts) : ''}</span>
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
          {CROWDING_NOTE} {SINGLE_VENUE_NOTE}
        </p>
      </div>

      <SourceFootnote env={positioning} />
    </Panel>
  );
}
