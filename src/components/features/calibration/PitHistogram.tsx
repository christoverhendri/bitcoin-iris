import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { CalibrationData } from '@/lib/features/forecastCalibration';
import {
  shapeSentence,
  uniformityTone,
  PIT_NOTE,
} from '@/lib/features/forecastCalibration';
import { toneVar } from '@/lib/theme/tokens';

/**
 * Probability integral transform.
 *
 * Each bar counts how often the real outcome landed in that slice of the
 * predicted distribution. A calibrated model spreads them evenly, so the bars
 * sit on the dashed line. The shape is diagnostic in a way a single coverage
 * number is not: it says *where* the model is wrong, not merely that it is.
 */

const W = 520;
const H = 190;
const PAD_X = 10;
const PAD_T = 12;
const PAD_B = 22;

export function PitHistogram({ cal }: { cal: Envelope<CalibrationData> }) {
  const d = cal.data;
  const bins = d.pitHistogram;

  if (bins.length === 0) {
    return (
      <Panel style={{ flex: 1, minWidth: 0 }}>
        <PanelHeader title="PIT HISTOGRAM" right={<MockBadge env={cal} />} />
        <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>
          No calibration windows
        </div>
        <SourceFootnote env={cal} />
      </Panel>
    );
  }

  const expected = bins[0].expected;
  const maxCount = Math.max(...bins.map((b) => b.count), expected, 1);
  const plotH = H - PAD_T - PAD_B;
  const slot = (W - PAD_X * 2) / bins.length;
  const barW = Math.max(2, slot * 0.78);
  const y = (count: number) => H - PAD_B - (count / maxCount) * plotH;

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="PIT HISTOGRAM"
        note={`${d.origins} origins · flat = calibrated`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag label={d.pitShape} tone={uniformityTone(d.pitUniformityScore)} />
            <MockBadge env={cal} />
          </div>
        }
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 190, display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          {bins.map((b, i) => (
            <rect
              key={i}
              x={PAD_X + i * slot + (slot - barW) / 2}
              y={y(b.count)}
              width={barW}
              height={Math.max(1, H - PAD_B - y(b.count))}
              fill="var(--blue)"
              fillOpacity={0.45}
            />
          ))}

          {/* what a perfectly calibrated model would produce */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(expected)}
            y2={y(expected)}
            stroke="var(--amber)"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={H - PAD_B}
            y2={H - PAD_B}
            stroke="var(--line2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          <text x={PAD_X} y={H - 7} fontFamily="var(--mono)" fontSize={8} fill="var(--dim)">
            0.0 — outcome below every path
          </text>
          <text
            x={W - PAD_X}
            y={H - 7}
            textAnchor="end"
            fontFamily="var(--mono)"
            fontSize={8}
            fill="var(--dim)"
          >
            above every path — 1.0
          </text>
          <text
            x={W - PAD_X}
            y={y(expected) - 4}
            textAnchor="end"
            fontFamily="var(--mono)"
            fontSize={8}
            fill="var(--amber)"
          >
            PERFECTLY FLAT
          </text>
        </svg>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            fontFamily: 'var(--mono)',
          }}
        >
          <span style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--mut)' }}>
            UNIFORMITY
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: toneVar(uniformityTone(d.pitUniformityScore)),
            }}
          >
            {d.pitUniformityScore.toFixed(0)}
          </span>
          <span style={{ fontSize: 9, color: 'var(--dim)' }}>/ 100</span>
        </div>

        <p style={noteStyle}>{shapeSentence(d)}</p>
        <p style={noteStyle}>{PIT_NOTE}</p>
      </div>

      <SourceFootnote env={cal} />
    </Panel>
  );
}

const noteStyle = {
  margin: 0,
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  lineHeight: 1.55,
  color: 'var(--dim)',
} as const;
