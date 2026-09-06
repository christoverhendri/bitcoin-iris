import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PriceDistributionData } from '@/lib/features/priceDistribution';
import { fmtUsd } from '@/lib/format';

/**
 * Where the paths actually ended, as a histogram on the price axis.
 *
 * Rotated to put price on the vertical, so it reads as a cross-section taken
 * through the right-hand edge of the fan chart rather than as an unrelated bar
 * chart. The shape is the point: a symmetric cone hides the fact that the
 * outcome distribution is skewed — lognormal in price even when the log returns
 * are centred.
 *
 * Bins are clipped to the 1st–99th percentile upstream, otherwise a single
 * runaway path flattens every meaningful bar.
 */

const W = 260;
const H = 300;
const PAD_T = 10;
const PAD_B = 10;
const LABEL_W = 62;

export function TerminalDistribution({ dist }: { dist: Envelope<PriceDistributionData> }) {
  const d = dist.data;
  const bins = d.terminalHistogram;

  if (bins.length === 0) {
    return (
      <Panel style={{ flex: 1, minWidth: 0 }}>
        <PanelHeader title="OUTCOME DENSITY" right={<MockBadge env={dist} />} />
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'var(--dim)',
          }}
        >
          No terminal distribution
        </div>
        <SourceFootnote env={dist} />
      </Panel>
    );
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const lo = bins[0].binLow;
  const hi = bins[bins.length - 1].binHigh;
  const span = hi - lo || 1;

  const y = (price: number) => H - PAD_B - ((price - lo) / span) * (H - PAD_T - PAD_B);
  const barH = Math.max(1, (H - PAD_T - PAD_B) / bins.length - 1);

  const last = d.bands[d.bands.length - 1];
  const median = last[3] * d.spot;
  const p25 = last[2] * d.spot;
  const p75 = last[4] * d.spot;

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="OUTCOME DENSITY"
        note={`at ${d.horizonLabel} · ${bins.length} bins`}
        right={<MockBadge env={dist} />}
      />

      <div style={{ padding: 12 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 300, display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          {bins.map((b, i) => {
            const centre = (b.binLow + b.binHigh) / 2;
            const w = (b.count / maxCount) * (W - LABEL_W - 8);
            // Inside the interquartile range reads as the likely region.
            const inIqr = centre >= p25 && centre <= p75;
            return (
              <rect
                key={i}
                x={LABEL_W}
                y={y(b.binHigh)}
                width={Math.max(0.5, w)}
                height={barH}
                fill="var(--blue)"
                fillOpacity={inIqr ? 0.55 : 0.24}
              />
            );
          })}

          {/* spot and median markers, on the same axis as the bars */}
          <line
            x1={LABEL_W}
            x2={W - 4}
            y1={y(d.spot)}
            y2={y(d.spot)}
            stroke="var(--txt)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text x={2} y={y(d.spot) + 3} fontFamily="var(--mono)" fontSize={8} fill="var(--txt)">
            SPOT
          </text>

          <line
            x1={LABEL_W}
            x2={W - 4}
            y1={y(median)}
            y2={y(median)}
            stroke="var(--blue)"
            strokeWidth={1}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
          <text x={2} y={y(median) + 3} fontFamily="var(--mono)" fontSize={8} fill="var(--blue)">
            P50
          </text>

          {[hi, (hi + lo) / 2, lo].map((p, i) => (
            <text
              key={i}
              x={2}
              y={y(p) + (i === 0 ? 8 : i === 2 ? -2 : 3)}
              fontFamily="var(--mono)"
              fontSize={7.5}
              fill="var(--dim)"
            >
              {fmtUsd(p)}
            </text>
          ))}
        </svg>

        <p
          style={{
            margin: '10px 0 0',
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          Solid bars mark the interquartile range — half of all simulated paths ended
          inside it. The distribution is skewed even though the log returns are centred:
          a price cannot fall below zero, but it can rise without bound.
        </p>
      </div>

      <SourceFootnote env={dist} />
    </Panel>
  );
}
