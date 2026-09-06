'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { fmtAgo } from '@/lib/format';
import { CATEGORY_COLOR, impactRadius } from '@/lib/features/geopoliticalEvents/present';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents';
import { WORLD_FEATURES } from '@/lib/geo/projection';
import type { WorldMapProps } from './WorldMap';

const W = 520;
const BASE_SCALE = W / 2 - 6;
const MIN_SCALE = BASE_SCALE * 0.7;
const MAX_SCALE = BASE_SCALE * 4;
const DEFAULT_ROT: [number, number] = [-20, -12];
const DRAG_SENS = 0.26;
const SPIN_STEP = 0.15;

const btn: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.08em',
  height: 22,
  minWidth: 22,
  padding: '0 4px',
  border: '1px solid var(--line2)',
  background: 'var(--panel)',
  color: 'var(--mut)',
  cursor: 'pointer',
};

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

function domSentimentColor(evs: GeoEvent[]): string {
  let pos = 0;
  let neg = 0;
  for (const e of evs) {
    if (e.sentiment === 'positive') pos++;
    else if (e.sentiment === 'negative') neg++;
  }
  return pos > neg ? 'var(--up)' : neg > pos ? 'var(--down)' : 'var(--mut)';
}

interface Placed {
  event: GeoEvent;
  x: number;
  y: number;
}
interface Cluster {
  key: string;
  cx: number;
  cy: number;
  events: GeoEvent[];
  place: string;
}

/**
 * Orthographic "3D" globe for the Global Sentiment map. Same event/cluster/detail
 * contract as `WorldMap` (flat) — drag to spin, wheel to zoom. Optional rotation
 * runs only while visible, idle, and reduced motion is off. Back face is culled.
 * Hand-drawn SVG, terminal tokens only: no lighting, no glow.
 */
export function GlobeMap({
  events,
  activeCats,
  selectedKey,
  onSelectKey,
  onOpenDetail,
}: WorldMapProps) {
  const [rot, setRot] = useState<[number, number]>(DEFAULT_ROT);
  const [scale, setScale] = useState(BASE_SCALE);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0, rot: DEFAULT_ROT });

  const idle = autoRotate && !over && !selectedKey;

  // Auto-spin only when idle. Throttled — each step reprojects the topology.
  useEffect(() => {
    if (!idle) return;
    let raf = 0;
    let last = 0;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tick = (t: number) => {
      if (t - last > 66) {
        last = t;
        setRot(([l, p]) => [(l + SPIN_STEP * 2) % 360, p]);
      }
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !motion.matches) raf = requestAnimationFrame(tick);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, [idle]);

  // Wheel zoom — attached natively so preventDefault stops the page scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * f)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to rotate — window listeners (no pointer capture, so marker clicks
  // still land on the markers).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
      const [l0, p0] = startRef.current.rot;
      setRot([l0 + dx * DRAG_SENS, Math.max(-89, Math.min(89, p0 - dy * DRAG_SENS))]);
    };
    const onUp = () => {
      draggingRef.current = false;
      setGrabbing(false);
      // Let the click that follows this pointerup read `moved`, then clear it.
      setTimeout(() => {
        movedRef.current = false;
      }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    setGrabbing(true);
    startRef.current = { x: e.clientX, y: e.clientY, rot };
  };

  const { landPaths, graticule, projectPoint } = useMemo(() => {
    const projection = geoOrthographic()
      .translate([W / 2, W / 2])
      .scale(scale)
      .rotate([rot[0], rot[1], 0])
      .clipAngle(90);
    const path = geoPath(projection);
    const center: [number, number] = [-rot[0], -rot[1]];
    return {
      landPaths: WORLD_FEATURES.features.map((f) => path(f) ?? '').filter(Boolean),
      graticule: path(geoGraticule10()) ?? '',
      projectPoint: (lon: number, lat: number): [number, number] | null => {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        if (geoDistance([lon, lat], center) > Math.PI / 2) return null; // back face
        const xy = projection([lon, lat]);
        if (!xy || Number.isNaN(xy[0]) || Number.isNaN(xy[1])) return null;
        return [xy[0], xy[1]];
      },
    };
  }, [rot, scale]);

  const placed = useMemo<Placed[]>(() => {
    const out: Placed[] = [];
    for (const e of events) {
      if (activeCats && !activeCats.has(e.category)) continue;
      const p = projectPoint(e.lon, e.lat);
      if (!p) continue;
      out.push({ event: e, x: p[0], y: p[1] });
    }
    return out;
  }, [events, activeCats, projectPoint]);

  const { singles, clusters } = useMemo(() => {
    const cell = 30 * (BASE_SCALE / scale);
    const buckets = new Map<string, Placed[]>();
    for (const m of placed) {
      const key = `${Math.round(m.x / cell)},${Math.round(m.y / cell)}`;
      const b = buckets.get(key);
      if (b) b.push(m);
      else buckets.set(key, [m]);
    }
    const s: Placed[] = [];
    const c: Cluster[] = [];
    for (const [bk, b] of buckets) {
      if (b.length === 1) {
        s.push(b[0]);
        continue;
      }
      const cx = b.reduce((sum, m) => sum + m.x, 0) / b.length;
      const cy = b.reduce((sum, m) => sum + m.y, 0) / b.length;
      const evs = b.map((m) => m.event);
      c.push({ key: `cl-${bk}`, cx, cy, events: evs, place: mostCommonPlace(evs) });
    }
    return { singles: s, clusters: c };
  }, [placed, scale]);

  const zoomBy = useCallback(
    (f: number) => setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * f))),
    [],
  );
  const reset = useCallback(() => {
    setScale(BASE_SCALE);
    setRot(DEFAULT_ROT);
  }, []);

  const hovered = hoverId ? (singles.find((s) => s.event.id === hoverId) ?? null) : null;
  const selectedSingle = selectedKey
    ? (singles.find((s) => s.event.id === selectedKey) ?? null)
    : null;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', background: 'var(--bg)' }}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => {
        setOver(false);
        setHoverId(null);
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${W}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%',
          display: 'block',
          cursor: grabbing ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        shapeRendering="geometricPrecision"
        onPointerDown={onPointerDown}
        onClick={() => {
          if (movedRef.current) return;
          onSelectKey(null);
          onOpenDetail(null);
        }}
        aria-label="Rotatable globe of crypto, macro and geopolitical events"
      >
        <circle
          cx={W / 2}
          cy={W / 2}
          r={scale}
          fill="var(--sunk)"
          stroke="var(--line2)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={graticule}
          fill="none"
          stroke="var(--line)"
          strokeWidth={0.5}
          strokeOpacity={0.5}
          vectorEffect="non-scaling-stroke"
        />

        {landPaths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="var(--panel)"
            stroke="var(--line2)"
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <circle
          cx={W / 2}
          cy={W / 2}
          r={scale}
          fill="none"
          stroke="var(--line2)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {clusters.map((c) => {
          const color = domSentimentColor(c.events);
          const r = 9 + Math.log2(c.events.length) * 3.5;
          return (
            <g
              key={c.key}
              style={{ cursor: 'pointer' }}
              onClick={(ev) => {
                ev.stopPropagation();
                if (movedRef.current) return;
                onOpenDetail({ kind: 'cluster', events: c.events, place: c.place });
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
                fontSize={11}
                fill="var(--txt)"
                pointerEvents="none"
              >
                {c.events.length}
              </text>
            </g>
          );
        })}

        {singles.map(({ event, x, y }) => {
          const color = CATEGORY_COLOR[event.category];
          const r = impactRadius(event.impact) * 1.15;
          return (
            <g key={event.id}>
              {/* fat invisible hit target so a moving dot is still clickable */}
              <circle
                cx={x}
                cy={y}
                r={Math.max(r + 6, 10)}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (movedRef.current) return;
                  onSelectKey(event.id);
                  onOpenDetail({ kind: 'event', event });
                }}
                onMouseEnter={() => setHoverId(event.id)}
                onMouseLeave={() => setHoverId(null)}
              />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                fillOpacity={0.85}
                stroke={color}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            </g>
          );
        })}

        {selectedSingle ? (
          <circle
            cx={selectedSingle.x}
            cy={selectedSingle.y}
            r={impactRadius(selectedSingle.event.impact) * 1.15 + 4}
            fill="none"
            stroke={CATEGORY_COLOR[selectedSingle.event.category]}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
      </svg>

      <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', gap: 2 }}>
        <button type="button" style={btn} aria-pressed={autoRotate} onClick={() => setAutoRotate((value) => !value)}>
          {autoRotate ? 'PAUSE ROTATION' : 'AUTO ROTATE'}
        </button>
        <button type="button" style={btn} onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          +
        </button>
        <button type="button" style={btn} onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <button type="button" style={btn} onClick={reset}>
          RESET
        </button>
      </div>

      {hovered ? (
        <div
          className="iris-micro"
          style={{
            position: 'absolute',
            left: `${(hovered.x / W) * 100}%`,
            top: `${(hovered.y / W) * 100}%`,
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
    </div>
  );
}
