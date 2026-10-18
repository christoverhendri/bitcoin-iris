'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

/** One hoverable x position, in the chart's viewBox units. `y` adds a dot. */
export interface HoverPoint {
  x: number;
  y?: number;
  /** Tooltip lines; the first is the date, set in bold. Pre-formatted by the server. */
  lines: string[];
}

/**
 * Wraps a hand-drawn SVG chart with a hover layer: a vertical crosshair at the
 * nearest point and a tooltip with its date and values (curation 2026-10-18:
 * every chart must show a date and value under the cursor).
 *
 * The chart's own marks stay server-rendered and arrive as `children`; the
 * tooltip text arrives pre-formatted, so server and browser render identically.
 */
export function ChartHover({
  viewW,
  viewH,
  points,
  height,
  children,
  preserveAspectRatio = 'none',
  svgStyle,
  ariaLabel,
}: {
  viewW: number;
  viewH: number;
  points: HoverPoint[];
  /** CSS height of the chart. */
  height: number;
  children: ReactNode;
  preserveAspectRatio?: string;
  svgStyle?: CSSProperties;
  ariaLabel?: string;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const p = idx === null ? null : points[idx];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * viewW;
    let best = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs(points[i].x - vx) < Math.abs(points[best].x - vx)) best = i;
    }
    setIdx(best);
  };

  const leftPct = p ? (p.x / viewW) * 100 : 0;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio={preserveAspectRatio}
        style={{ width: '100%', height, display: 'block', touchAction: 'none', ...svgStyle }}
        onPointerMove={onMove}
        onPointerLeave={() => setIdx(null)}
        role="img"
        aria-label={ariaLabel}
      >
        {children}
        {p ? (
          <g pointerEvents="none">
            <line x1={p.x} x2={p.x} y1={0} y2={viewH} stroke="var(--mut)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {p.y !== undefined ? (
              <circle cx={p.x} cy={p.y} r={3.5} fill="var(--txt)" stroke="var(--panel)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ) : null}
          </g>
        ) : null}
      </svg>
      {p ? (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 4,
            left: `${leftPct}%`,
            transform: `translateX(${leftPct > 70 ? '-105%' : leftPct < 30 ? '5%' : '-50%'})`,
            background: 'var(--sunk)',
            border: '1px solid var(--line2)',
            padding: '5px 8px',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            lineHeight: 1.5,
            color: 'var(--txt)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {p.lines.map((l, i) => (
            <div key={i} style={i === 0 ? { fontWeight: 700 } : { color: 'var(--mut)' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
