'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import { WORLD_FEATURES } from '@/lib/geo/projection';
import { ACCENT } from '@/lib/theme/tokens';
import type { WorldMapProps } from './WorldMap';

const D = Math.PI / 180;
const HOME = { lon: 25 * D, lat: 22 * D };
const MAX_LAT = 70 * D;

/** Events at one place share one marker; its size is how many there are. */
interface Spot {
  key: string;
  lat: number;
  lon: number;
  place: string;
  events: GeoEvent[];
  /** positives minus negatives, over the count. */
  tone: number;
}

interface View {
  lon: number;
  lat: number;
  vLon: number;
  vLat: number;
  zoom: number;
  zoomT: number;
  focus: { lon: number; lat: number } | null;
  lastInput: number;
  spin: number;
}

/**
 * Sample a near-uniform set of points on the sphere (a Fibonacci lattice) and
 * split them into land and sea against a raster of the Natural Earth country
 * polygons. Each point is stored as (cos lat, sin lat, cos lon, sin lon) so the
 * frame loop needs no trigonometry per dot.
 */
function buildDots(): { land: Float32Array; sea: Float32Array } {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const path = geoPath(projection, ctx);
  ctx.beginPath();
  for (const f of WORLD_FEATURES.features) path(f);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const mask = ctx.getImageData(0, 0, W, H).data;

  const N = 16000;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const land: number[] = [];
  const sea: number[] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i;
    const lat = Math.asin(y);
    const lon = Math.atan2(Math.sin(th) * r, Math.cos(th) * r);
    const px = Math.min(W - 1, Math.floor(((lon / D + 180) / 360) * W));
    const py = Math.min(H - 1, Math.floor(((90 - lat / D) / 180) * H));
    const isLand = mask[(py * W + px) * 4 + 3] > 128 || lat / D < -70;
    const rec = [Math.cos(lat), Math.sin(lat), Math.cos(lon), Math.sin(lon)];
    if (isLand) land.push(...rec);
    else if (i % 3 === 0) sea.push(...rec);
  }
  return { land: new Float32Array(land), sea: new Float32Array(sea) };
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function groupSpots(events: GeoEvent[], activeCats: Set<EventCategory> | null): Spot[] {
  const map = new Map<string, Spot>();
  for (const e of events) {
    if (activeCats && !activeCats.has(e.category)) continue;
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const key = `${e.lat.toFixed(1)},${e.lon.toFixed(1)}`;
    let s = map.get(key);
    if (!s) {
      s = { key, lat: e.lat, lon: e.lon, place: e.place, events: [], tone: 0 };
      map.set(key, s);
    }
    s.events.push(e);
  }
  for (const s of map.values()) {
    const pos = s.events.filter((e) => e.sentiment === 'positive').length;
    const neg = s.events.filter((e) => e.sentiment === 'negative').length;
    s.tone = (pos - neg) / s.events.length;
    s.events.sort((a, b) => b.publishedAt - a.publishedAt);
  }
  return [...map.values()];
}

/**
 * The Ember globe: a sphere of cream land dots over a warm dark body, an
 * orange atmosphere, and every world event as a pulsing point. It turns on its
 * own, follows a drag 1:1 and keeps the release velocity (then slows down),
 * zooms with the wheel, a pinch or the buttons, and turns to whatever event is
 * picked — on the globe or in the news rail beside it.
 *
 * Drawn on a 2D canvas: one draw call per dot, no WebGL, no texture download.
 */
export function EmberGlobe(props: WorldMapProps & { style?: CSSProperties }) {
  const { events, activeCats, selectedKey, onSelectKey, onOpenDetail, style } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spots = useMemo(() => groupSpots(events, activeCats), [events, activeCats]);
  const [zoomPct, setZoomPct] = useState(100);
  const [spinning, setSpinning] = useState(true);

  // Everything the frame loop reads lives in refs, so the loop never restarts.
  const view = useRef<View>({ ...HOME, vLon: 0, vLat: 0, zoom: 1, zoomT: 1, focus: null, lastInput: 0, spin: 0 });
  const live = useRef({ spots, selectedKey, spinning, onSelectKey, onOpenDetail });
  useEffect(() => {
    live.current = { spots, selectedKey, spinning, onSelectKey, onOpenDetail };
  }, [spots, selectedKey, spinning, onSelectKey, onOpenDetail]);
  const hits = useRef<{ key: string; x: number; y: number }[]>([]);
  const hover = useRef<string | null>(null);

  const syncZoom = () => setZoomPct(Math.round(view.current.zoomT * 100));
  const clampZ = (z: number) => Math.max(0.85, Math.min(4, z));
  const clampLat = (v: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, v));

  const focusOn = (lat: number, lon: number) => {
    const v = view.current;
    v.focus = { lon: lon * D, lat: clampLat(lat * D) };
    v.zoomT = Math.max(v.zoomT, 1.5);
    v.vLon = 0;
    v.vLat = 0;
    v.lastInput = performance.now() + 5000;
    syncZoom();
  };

  // A pick from outside (the news rail) turns the globe to that event.
  useEffect(() => {
    if (!selectedKey) return;
    const e = events.find((x) => x.id === selectedKey);
    if (e) focusOn(e.lat, e.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { land, sea } = buildDots();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { moved: number; hist: { x: number; y: number; t: number }[] } | null = null;
    let pinch: { d: number; z: number } | null = null;
    let raf = 0;
    let lastT = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const radius = () => Math.min(canvas.clientWidth, canvas.clientHeight) * 0.42 * view.current.zoom;
    const hitTest = (p: { x: number; y: number }) => {
      let best: string | null = null;
      let bd = 18;
      for (const h of hits.current) {
        const d = Math.hypot(h.x - p.x, h.y - p.y);
        if (d < bd) {
          bd = d;
          best = h.key;
        }
      }
      return best;
    };
    const openSpot = (key: string) => {
      const s = live.current.spots.find((x) => x.key === key);
      if (!s) return;
      focusOn(s.lat, s.lon);
      if (s.events.length === 1) {
        live.current.onSelectKey(s.events[0].id);
        live.current.onOpenDetail({ kind: 'event', event: s.events[0] });
      } else {
        live.current.onSelectKey(s.events[0].id);
        live.current.onOpenDetail({ kind: 'cluster', events: s.events, place: s.place });
      }
    };

    const onDown = (e: PointerEvent) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
      const p = local(e);
      pointers.set(e.pointerId, p);
      const v = view.current;
      const now = performance.now();
      v.lastInput = now;
      v.focus = null;
      v.vLon = 0;
      v.vLat = 0;
      if (pointers.size === 1) drag = { moved: 0, hist: [{ ...p, t: now }] };
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: v.zoomT };
        drag = null;
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const v = view.current;
      if (!pointers.has(e.pointerId)) {
        hover.current = hitTest(p);
        canvas.style.cursor = hover.current ? 'pointer' : 'grab';
        return;
      }
      pointers.set(e.pointerId, p);
      v.lastInput = performance.now();
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        v.zoomT = clampZ((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
        syncZoom();
        return;
      }
      if (!drag) return;
      const last = drag.hist[drag.hist.length - 1];
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const R = radius();
      v.lon -= dx / R;
      v.lat = clampLat(v.lat + dy / R);
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.hist.push({ ...p, t: performance.now() });
      if (drag.hist.length > 6) drag.hist.shift();
      canvas.style.cursor = 'grabbing';
    };
    const onUp = (e: PointerEvent) => {
      const v = view.current;
      const now = performance.now();
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (pointers.size < 2) pinch = null;
      const d = drag;
      drag = null;
      if (!d) return;
      canvas.style.cursor = 'grab';
      if (d.moved < 6) {
        const key = hitTest(p ?? d.hist[d.hist.length - 1]);
        if (key) openSpot(key);
        return;
      }
      // Hand the finger's velocity to the globe so it keeps turning, then slows.
      const a = d.hist[0];
      const b = d.hist[d.hist.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      if (now - b.t < 90) {
        const R = radius();
        v.vLon = -(b.x - a.x) / R / dt;
        v.vLat = (b.y - a.y) / R / dt;
      }
      v.lastInput = now;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.zoomT = clampZ(v.zoomT * Math.exp(-e.deltaY * 0.0015));
      v.lastInput = performance.now();
      syncZoom();
    };
    const onLeave = () => {
      hover.current = null;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const plot = (
      ctx: CanvasRenderingContext2D,
      A: Float32Array,
      color: string,
      a0: number,
      a1: number,
      s: number,
      cx: number,
      cy: number,
      R: number,
      w: number,
      h: number,
      sl0: number,
      cl0: number,
      cL0: number,
      sL0: number,
    ) => {
      ctx.fillStyle = color;
      const hs = s / 2;
      for (let i = 0; i < A.length; i += 4) {
        const cl = A[i];
        const sl = A[i + 1];
        const cLon = A[i + 2];
        const sLon = A[i + 3];
        const cosDl = cLon * cL0 + sLon * sL0;
        const z = sl0 * sl + cl0 * cl * cosDl;
        if (z <= 0) continue;
        const sinDl = sLon * cL0 - cLon * sL0;
        const x = cx + cl * sinDl * R;
        const y = cy - (cl0 * sl - sl0 * cl * cosDl) * R;
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        ctx.globalAlpha = a0 + a1 * z;
        ctx.fillRect(x - hs, y - hs, s, s);
      }
      ctx.globalAlpha = 1;
    };

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(w * dpr);
      const H = Math.round(h * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const v = view.current;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42 * v.zoom;
      const TAU = Math.PI * 2;

      let g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.34);
      g.addColorStop(0, rgba(ACCENT, 0.34));
      g.addColorStop(0.3, rgba(ACCENT, 0.12));
      g.addColorStop(1, rgba(ACCENT, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.34, 0, TAU);
      ctx.fill();

      g = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R);
      g.addColorStop(0, '#2c1f16');
      g.addColorStop(0.6, '#150f0b');
      g.addColorStop(1, '#0b0806');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fill();

      const sl0 = Math.sin(v.lat);
      const cl0 = Math.cos(v.lat);
      const cL0 = Math.cos(v.lon);
      const sL0 = Math.sin(v.lon);
      const s = Math.max(1.3, 1.6 * Math.sqrt(v.zoom));
      plot(ctx, sea, '#7a5338', 0.02, 0.3, s * 0.75, cx, cy, R, w, h, sl0, cl0, cL0, sL0);
      plot(ctx, land, '#f3e6d8', 0.1, 0.85, s, cx, cy, R, w, h, sl0, cl0, cL0, sL0);

      ctx.strokeStyle = rgba(ACCENT, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();

      const { spots: list, selectedKey: sel } = live.current;
      const selSpot = sel ? list.find((x) => x.events.some((e) => e.id === sel))?.key ?? null : null;
      const tt = t / 1000;
      const moving = !mq.matches;
      const next: { key: string; x: number; y: number }[] = [];
      let label: { text: string; x: number; y: number; z: number; strong: boolean } | null = null;
      for (let k = 0; k < list.length; k++) {
        const sp = list[k];
        const la = sp.lat * D;
        const lo = sp.lon * D;
        const cl = Math.cos(la);
        const sl = Math.sin(la);
        const cosDl = Math.cos(lo) * cL0 + Math.sin(lo) * sL0;
        const sinDl = Math.sin(lo) * cL0 - Math.cos(lo) * sL0;
        const z = sl0 * sl + cl0 * cl * cosDl;
        if (z <= 0.03) continue;
        const x = cx + cl * sinDl * R;
        const y = cy - (cl0 * sl - sl0 * cl * cosDl) * R;
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
        const col = sp.tone > 0 ? ACCENT : sp.tone < 0 ? '#e8d5c4' : '#b8663a';
        const base = 2.6 + Math.min(6, Math.sqrt(sp.events.length) * 1.9);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        if (moving) {
          for (let r = 0; r < 2; r++) {
            const ph = (tt * 0.5 + k * 0.29 + r * 0.5) % 1;
            ctx.globalAlpha = (1 - ph) * 0.55 * z;
            ctx.beginPath();
            ctx.arc(x, y, base + ph * base * 3.2, 0, TAU);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = z;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10 + base * 1.5;
        ctx.beginPath();
        ctx.arc(x, y, base, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        next.push({ key: sp.key, x, y });
        const isSel = sp.key === selSpot;
        if (isSel || sp.key === hover.current) {
          ctx.strokeStyle = '#f6eee7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, base + 7, 0, TAU);
          ctx.stroke();
          if (isSel || !label) {
            label = {
              text: sp.events.length > 1 ? `${sp.place} · ${sp.events.length}` : sp.place,
              x,
              y,
              z,
              strong: isSel,
            };
          }
        }
      }
      ctx.globalAlpha = 1;
      hits.current = next;

      if (label) {
        ctx.font = '600 13px "Inter Tight", system-ui, sans-serif';
        const tw = ctx.measureText(label.text).width;
        const bw = tw + 20;
        const bh = 26;
        let bx = label.x + 16;
        let by = label.y - 34;
        if (bx + bw > w - 8) bx = label.x - 16 - bw;
        if (by < 8) by = label.y + 14;
        ctx.globalAlpha = label.z;
        ctx.strokeStyle = '#f6eee7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(label.x, label.y);
        ctx.lineTo(bx < label.x ? bx + bw : bx, by + bh / 2);
        ctx.stroke();
        ctx.fillStyle = label.strong ? '#f6eee7' : '#2a1e15';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = label.strong ? '#1a110b' : '#f6eee7';
        ctx.fillText(label.text, bx + 10, by + 17.5);
        ctx.globalAlpha = 1;
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
      lastT = t;
      const v = view.current;
      const now = performance.now();
      const motion = !mq.matches;
      if (v.focus) {
        let dl = v.focus.lon - v.lon;
        dl = Math.atan2(Math.sin(dl), Math.cos(dl));
        const k = motion ? 1 - Math.exp(-dt * 4.5) : 1;
        v.lon += dl * k;
        v.lat += (v.focus.lat - v.lat) * k;
        if (Math.abs(dl) < 0.002 && Math.abs(v.focus.lat - v.lat) < 0.002) v.focus = null;
        v.spin = 0;
      } else if (!drag && !pinch) {
        v.lon += v.vLon * dt;
        v.lat = clampLat(v.lat + v.vLat * dt);
        const f = Math.exp(-dt * 2.2);
        v.vLon *= f;
        v.vLat *= f;
        const want = live.current.spinning && motion && now - v.lastInput > 2200 ? 1 : 0;
        v.spin += (want - v.spin) * (1 - Math.exp(-dt * 1.5));
        v.lon -= (6 * D * dt * v.spin) / Math.max(1, v.zoom * 0.8);
      }
      v.zoom += (v.zoomT - v.zoom) * (motion ? 1 - Math.exp(-dt * 7) : 1);
      draw(t);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = (f: number) => {
    const v = view.current;
    v.zoomT = clampZ(v.zoomT * f);
    v.lastInput = performance.now();
    syncZoom();
  };

  return (
    <div className="globe-in" style={{ position: 'absolute', inset: 0, ...style }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Rotating globe of ${spots.length} places with world events. Drag to turn, scroll or pinch to zoom, pick a point to read it.`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }}
      />
      <div style={{ position: 'absolute', left: 18, top: 16, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e9ddd2' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />
          Mostly positive headlines
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e9ddd2' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e8d5c4' }} />
          Mostly negative
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e9ddd2' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#b8663a' }} />
          Neutral or mixed
        </span>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>Bigger point, more stories there</span>
      </div>
      <span className="globe-hint">Drag to turn · scroll or pinch to zoom</span>
      <div
        role="group"
        aria-label="Globe controls"
        style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: 4, padding: 5, borderRadius: 999, background: '#1a130e' }}
      >
        <button type="button" className="globe-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <span style={{ minWidth: 46, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#e9ddd2' }}>{zoomPct}%</span>
        <button type="button" className="globe-btn" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <span style={{ width: 2, height: 20, margin: '0 4px', borderRadius: 1, background: '#2e2219' }} />
        <button
          type="button"
          className="globe-btn"
          aria-label={spinning ? 'Stop rotation' : 'Start rotation'}
          aria-pressed={spinning}
          onClick={() => {
            view.current.lastInput = 0;
            setSpinning((x) => !x);
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 4v5h-5" />
          </svg>
        </button>
        <button
          type="button"
          className="globe-btn"
          aria-label="Reset view"
          onClick={() => {
            const v = view.current;
            v.focus = { ...HOME };
            v.zoomT = 1;
            v.lastInput = performance.now();
            setSpinning(true);
            syncZoom();
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <circle cx={12} cy={12} r={8} />
            <circle cx={12} cy={12} r={2} />
          </svg>
        </button>
      </div>
    </div>
  );
}
