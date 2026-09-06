/**
 * A bare 1-year sparkline. No axis, no fill, no markers — it exists to show
 * shape next to a number, and anything more would compete with the number.
 */

const W = 120;
const H = 24;

export function MiniSpark({
  points,
  stroke = 'var(--mut)',
}: {
  points: { ts: number; close: number }[];
  stroke?: string;
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

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: W, height: H, display: 'block' }}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
