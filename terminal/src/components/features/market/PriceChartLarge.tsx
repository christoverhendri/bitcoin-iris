import { Panel, PanelHeader, PanelStrip, StatTile, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { OhlcvCandle } from '@/lib/features/ohlcv';
import type { SupportResistanceLevels } from '@/lib/features/levels';
import { toOhlcvLabel } from '@/lib/features/ohlcv/present';

export interface PriceChartLargeProps {
  ohlcv: Envelope<OhlcvCandle[]>;
  /** Optional support/resistance envelope — drawn as horizontal guide lines. */
  levels?: Envelope<SupportResistanceLevels>;
  /** Active timeframe label (`1D`..`ALL`), shown in the panel note. */
  timeframe?: string;
}

const W = 800;
const H = 260;
const PAD = 8;

export function PriceChartLarge({ ohlcv, levels, timeframe }: PriceChartLargeProps) {
  const candles = ohlcv.data;
  const n = candles.length;
  const latest = candles[n - 1];

  const guideLines = levels
    ? [
        { key: 'R1', v: levels.data.r1, tone: 'var(--down)' },
        { key: 'VWAP', v: levels.data.vwap, tone: 'var(--blue)' },
        { key: 'S1', v: levels.data.s1, tone: 'var(--up)' },
      ]
    : [];

  const highs = candles.map((c) => c.high).concat(guideLines.map((g) => g.v));
  const lows = candles.map((c) => c.low).concat(guideLines.map((g) => g.v));
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const span = hi - lo || 1;

  const cw = n > 0 ? (W - PAD * 2) / n : W;
  const bodyW = Math.max(1, cw * 0.6);
  const y = (p: number) => H - PAD - ((p - lo) / span) * (H - PAD * 2);

  const ohl = latest ? toOhlcvLabel(latest) : null;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="PRICE ACTION"
        note={`${n} candles · ${timeframe ?? "1D"}`}
        right={<MockBadge env={ohlcv} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '260px', display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={`g-${t}`}
              x1={PAD}
              x2={W - PAD}
              y1={PAD + t * (H - PAD * 2)}
              y2={PAD + t * (H - PAD * 2)}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {candles.map((c, i) => {
            const cx = PAD + (i + 0.5) * cw;
            const up = c.close >= c.open;
            const tone = up ? 'var(--up)' : 'var(--down)';
            const bodyTop = y(Math.max(c.open, c.close));
            const bodyBot = y(Math.min(c.open, c.close));
            return (
              <g key={i}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={tone}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={cx - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={Math.max(1, bodyBot - bodyTop)}
                  fill={tone}
                />
              </g>
            );
          })}

          {guideLines.map((g) => (
            <line
              key={g.key}
              x1={PAD}
              x2={W - PAD}
              y1={y(g.v)}
              y2={y(g.v)}
              stroke={g.tone}
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {ohl ? (
          <PanelStrip min={120}>
            <StatTile label="OPEN" value={ohl.open} tone="txt" />
            <StatTile label="HIGH" value={ohl.high} tone="up" />
            <StatTile label="LOW" value={ohl.low} tone="down" />
            <StatTile label="CLOSE" value={ohl.close} tone={latest && latest.close >= latest.open ? 'up' : 'down'} />
            <StatTile label="VOLUME" value={ohl.volume} tone="mut" />
          </PanelStrip>
        ) : null}
      </div>
      <SourceFootnote env={ohlcv} />
    </Panel>
  );
}
