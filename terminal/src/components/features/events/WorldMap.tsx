'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import {
  zoom as d3zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom';
import { fmtAgo } from '@/lib/format';
import { CATEGORY_COLOR, impactRadius } from '@/lib/features/geopoliticalEvents/present';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import { WORLD_FEATURES, makeProjection, spherePath } from '@/lib/geo/projection';

const W = 960;
const H = 500;

const zoomBtn: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.08em',
  height: 22,
  minWidth: 22,
  padding: 0,
  border: '1px solid var(--line2)',
  background: 'var(--panel)',
  color: 'var(--mut)',
  cursor: 'pointer',
};

/** What the map hands up when a marker or cluster is opened. */
export type DetailPayload =
  | { kind: 'event'; event: GeoEvent }
  | { kind: 'cluster'; events: GeoEvent[]; place: string };

export interface WorldMapProps {
  events: GeoEvent[];
  activeCats: Set<EventCategory> | null;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onOpenDetail: (payload: DetailPayload | null) => void;
}

interface Placed {
  event: GeoEvent;
  x: number;
  y: number;
}
interface Cluster {
  cx: number;
  cy: number;
  events: GeoEvent[];
  place: string;
}

function mostCommonPlace(evs: GeoEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of evs) counts.set(e.place, (counts.get(e.place) ?? 0) + 1);
  let best = evs[0]?.place ?? '';
  let bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = p;
    }
  }
  return best;
}

/** Cluster fill: dominant sentiment among its members. Terminal tokens only. */
function domSentimentColor(evs: GeoEvent[]): string {
  let pos = 0;
  let neg = 0;
  for (const e of evs) {
    if (e.sentiment === 'positive') pos++;
    else if (e.sentiment === 'negative') neg++;
  }
  return pos > neg ? 'var(--up)' : neg > pos ? 'var(--down)' : 'var(--mut)';
}

export function WorldMap({
  events,
  activeCats,
  selectedKey,
  onSelectKey,
  onOpenDetail,
}: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { path } = useMemo(() => makeProjection(W, H), []);
  const sphere = useMemo(() => spherePath(W, H), []);
  const landPaths = useMemo(
    () => WORLD_FEATURES.features.map((f) => path(f) ?? '').filter(Boolean),
    [path],
  );

  // Every visible event projected to pre-transform 960x500 coordinates.
  const placed = useMemo<Placed[]>(() => {
    const { projection } = makeProjection(W, H);
    const out: Placed[] = [];
    for (const e of events) {
      if (activeCats && !activeCats.has(e.category)) continue;
      const p = projection([e.lon, e.lat]);
      if (!p || Number.isNaN(p[0]) || Number.isNaN(p[1])) continue;
      out.push({ event: e, x: p[0], y: p[1] });
    }
    return out;
  }, [events, activeCats]);

  const k = transform.k;

  // Grid-bucket into singles + clusters. Cell shrinks as you zoom in, so
  // clusters break apart the closer you look.
  const { singles, clusters } = useMemo(() => {
    const cell = 34 / k;
    const buckets = new Map<string, Placed[]>();
    for (const m of placed) {
      const key = `${Math.round(m.x / cell)},${Math.round(m.y / cell)}`;
      const b = buckets.get(key);
      if (b) b.push(m);
      else buckets.set(key, [m]);
    }
    const s: Placed[] = [];
    const c: Cluster[] = [];
    for (const b of buckets.values()) {
      if (b.length === 1) {
        s.push(b[0]);
        continue;
      }
      const cx = b.reduce((sum, m) => sum + m.x, 0) / b.length;
      const cy = b.reduce((sum, m) => sum + m.y, 0) / b.length;
      const evs = b.map((m) => m.event);
      c.push({ cx, cy, events: evs, place: mostCommonPlace(evs) });
    }
    return { singles: s, clusters: c };
  }, [placed, k]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([
        [0, 0],
        [W, H],
      ])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(e.transform));
    zoomRef.current = zb;
    select(svg).call(zb);
    return () => {
      zb.on('zoom', null);
      select(svg).on('.zoom', null);
      zoomRef.current = null;
    };
  }, []);

  const zoomByFactor = (factor: number) => {
    const svg = svgRef.current;
    const zb = zoomRef.current;
    if (!svg || !zb) return;
    zb.scaleBy(select(svg).transition().duration(200), factor);
  };
  const resetZoom = () => {
    const svg = svgRef.current;
    const zb = zoomRef.current;
    if (!svg || !zb) return;
    zb.transform(select(svg).transition().duration(200), zoomIdentity);
  };

  const handleCluster = (c: Cluster) => {
    const svg = svgRef.current;
    const zb = zoomRef.current;
    if (k < 4 && svg && zb) {
      // Zoom toward the centroid, keeping it fixed on screen.
      const rect = svg.getBoundingClientRect();
      const sx = ((transform.x + c.cx * k) / W) * rect.width;
      const sy = ((transform.y + c.cy * k) / H) * rect.height;
      zb.scaleBy(select(svg).transition().duration(250), 2, [sx, sy]);
    } else {
      onOpenDetail({ kind: 'cluster', events: c.events, place: c.place });
    }
  };

  const hovered = hoverId ? (singles.find((s) => s.event.id === hoverId) ?? null) : null;
  const selectedSingle = selectedKey
    ? (singles.find((s) => s.event.id === selectedKey) ?? null)
    : null;
  const root = 1 / Math.sqrt(k);

  return (
    <div style={{ position: 'relative', width: '100%', background: 'var(--bg)' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', display: 'block', cursor: 'grab', touchAction: 'none' }}
        shapeRendering="geometricPrecision"
        onClick={() => {
          onSelectKey(null);
          onOpenDetail(null);
        }}
        aria-label="World map of crypto, macro and geopolitical events"
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${k})`}>
          <path
            d={sphere}
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {landPaths.map((d, i) => (
            <path
              key={i}
              className="land"
              d={d}
              fill="var(--sunk)"
              stroke="var(--line2)"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* clusters first */}
          {clusters.map((c, i) => {
            const color = domSentimentColor(c.events);
            const r = (9 + Math.log2(c.events.length) * 3.5) * root;
            return (
              <g
                key={`cl-${i}`}
                style={{ cursor: 'pointer' }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleCluster(c);
                }}
              >
                <circle
                  cx={c.cx}
                  cy={c.cy}
                  r={r}
                  fill={color}
                  fillOpacity={0.28}
                  stroke={color}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={c.cx}
                  y={c.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="var(--mono)"
                  fontSize={11 * root}
                  fill="var(--txt)"
                  pointerEvents="none"
                >
                  {c.events.length}
                </text>
              </g>
            );
          })}

          {/* then singles */}
          {singles.map(({ event, x, y }) => {
            const color = CATEGORY_COLOR[event.category];
            const r = impactRadius(event.impact) * root * 1.1;
            return (
              <circle
                key={event.id}
                cx={x}
                cy={y}
                r={r}
                fill={color}
                fillOpacity={0.85}
                stroke={color}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer' }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectKey(event.id);
                  onOpenDetail({ kind: 'event', event });
                }}
                onMouseEnter={() => setHoverId(event.id)}
                onMouseLeave={() => setHoverId(null)}
              />
            );
          })}

          {/* selected on top */}
          {selectedSingle ? (
            <circle
              cx={selectedSingle.x}
              cy={selectedSingle.y}
              r={impactRadius(selectedSingle.event.impact) * root * 1.1 + 4 * root}
              fill="none"
              stroke={CATEGORY_COLOR[selectedSingle.event.category]}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : null}
        </g>
      </svg>

      {hovered ? (
        <div
          className="iris-micro"
          style={{
            position: 'absolute',
            left: `${((transform.x + hovered.x * k) / W) * 100}%`,
            top: `${((transform.y + hovered.y * k) / H) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 8px))',
            maxWidth: 240,
            pointerEvents: 'none',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            padding: '6px 8px',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            lineHeight: 1.4,
            color: 'var(--txt)',
            zIndex: 2,
          }}
        >
          <div style={{ marginBottom: 3 }}>{hovered.event.headline}</div>
          <div style={{ color: 'var(--dim)', letterSpacing: '.1em' }}>
            {hovered.event.place.toUpperCase()} · {hovered.event.category} ·{' '}
            {fmtAgo(new Date(hovered.event.publishedAt).toISOString())}
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          display: 'flex',
          gap: 1,
          background: 'var(--line2)',
          zIndex: 3,
        }}
      >
        <button
          type="button"
          title="Zoom out"
          onClick={() => zoomByFactor(1 / 1.6)}
          className="iris-micro"
          style={zoomBtn}
        >
          −
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => zoomByFactor(1.6)}
          className="iris-micro"
          style={zoomBtn}
        >
          +
        </button>
        <button
          type="button"
          title="Reset view"
          onClick={() => resetZoom()}
          className="iris-micro"
          style={{ ...zoomBtn, padding: '0 6px' }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}
