import { Panel, PanelHeader, PanelStrip, StatTile, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainNetworkData } from '@/lib/features/chainNetwork';
import { fmtHashrate } from '@/lib/features/chainNetwork';
import { fmtPct, fmtDayMonth } from '@/lib/format';
import { signTone } from '@/lib/theme/tokens';

/**
 * Daily average hashrate over three months.
 *
 * Inline SVG rather than `lightweight-charts`, matching `PriceChartLarge`: this
 * is a static line with no crosshair or zoom, so a server-rendered path costs
 * nothing at runtime and cannot produce a hydration mismatch.
 *
 * The y-axis deliberately does **not** start at zero. Hashrate never approaches
 * zero, so a zero-based axis would compress three months of real variation into
 * a flat line at the top of the panel. The axis labels state the range so the
 * scaling is visible rather than implied.
 */

const W = 800;
const H = 180;
const PAD_X = 8;
const PAD_Y = 12;

export function HashrateChart({ network }: { network: Envelope<ChainNetworkData> }) {
  const h = network.data.hashrate;
  const pts = h.points;
  const n = pts.length;

  if (n === 0) {
    return (
      <Panel style={{ flex: 1, minWidth: 0 }}>
        <PanelHeader title="HASHRATE" right={<MockBadge env={network} />} />
        <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>
          No hashrate series
        </div>
        <SourceFootnote env={network} />
      </Panel>
    );
  }

  const values = pts.map((p) => p.ehs);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = hi - lo || 1;

  const x = (i: number) => PAD_X + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2));
  const y = (v: number) => H - PAD_Y - ((v - lo) / span) * (H - PAD_Y * 2);

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ehs).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD_Y} L${x(0).toFixed(1)},${H - PAD_Y} Z`;

  const tone = signTone(h.changePct);
  const stroke = h.changePct >= 0 ? 'var(--up)' : 'var(--down)';

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="HASHRATE"
        note={`${n} daily averages · ${fmtDayMonth(new Date(pts[0].ts).toISOString())} → today`}
        right={<MockBadge env={network} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: 180, display: 'block', background: 'var(--sunk)' }}
            shapeRendering="geometricPrecision"
          >
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1={PAD_X}
                x2={W - PAD_X}
                y1={PAD_Y + t * (H - PAD_Y * 2)}
                y2={PAD_Y + t * (H - PAD_Y * 2)}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={area} fill={stroke} opacity="0.10" />
            <path
              d={line}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Axis bounds as text, because the axis is not zero-based. */}
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: 6,
              fontFamily: 'var(--mono)',
              fontSize: 8,
              color: 'var(--dim)',
            }}
          >
            {hi.toFixed(0)} EH/s
          </span>
          <span
            style={{
              position: 'absolute',
              bottom: 2,
              left: 6,
              fontFamily: 'var(--mono)',
              fontSize: 8,
              color: 'var(--dim)',
            }}
          >
            {lo.toFixed(0)} EH/s
          </span>
        </div>

        <PanelStrip min={140}>
          <StatTile label="CURRENT" value={fmtHashrate(h.currentEhs)} tone="txt" />
          <StatTile label="3M CHANGE" value={fmtPct(h.changePct)} tone={tone} detail="first vs last" />
          <StatTile label="PEAK" value={fmtHashrate(hi)} tone="mut" detail="in window" />
          <StatTile
            label="DIFFICULTY"
            value={`${(h.currentDifficulty / 1e12).toFixed(1)}T`}
            tone="mut"
          />
        </PanelStrip>
      </div>

      <SourceFootnote env={network} />
    </Panel>
  );
}
