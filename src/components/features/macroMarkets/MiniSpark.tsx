import { ChartHover } from '@/components/charts/ChartHover';
import { fmtDay } from '@/lib/dates';

/**
 * A bare 1-year sparkline. No axis, no fill, no markers — it exists to show
 * shape next to a number. Hover shows the date and the level (curation
 * 2026-10-18).
 */

const W = 120;
const H = 24;

export function MiniSpark({
  points,
  stroke = 'var(--mut)',
  fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
}: {
  points: { ts: number; close: number }[];
  stroke?: string;
  fmt?: (v: number) => string;
}) {
  const n = points.length;
  if (n < 2) return null;

  const values = points.map((p) => p.close);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = hi - lo || 1;

  const d = points
    .map((p, i) => {
      const x = (i / (n - 1)) * W;
      const y = H - 2 - ((p.close - lo) / span) * (H - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const hoverPoints = points.map((p, i) => ({
    x: (i / (n - 1)) * W,
    y: H - 2 - ((p.close - lo) / span) * (H - 4),
    lines: [fmtDay(p.ts), fmt(p.close)],
  }));

  return (
    <div style={{ width: W }}>
    <ChartHover viewW={W} viewH={H} points={hoverPoints} height={H} ariaLabel="Grafik setahun">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
    </ChartHover>
    </div>
  );
}
