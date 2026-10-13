import {
  CanvasTexture, Mesh, MeshBasicMaterial, OrthographicCamera, Scene,
  SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { WORLD_FEATURES } from '@/lib/geo/projection';
import { CATEGORY_COLOR, impactRadius } from '@/lib/features/geopoliticalEvents/present';
import { globePoint, clusterGlobeMarkers, type GlobeMarker } from '@/lib/geo/globeMarkers';
import type { WorldMapProps } from './WorldMap';

export interface GlobeRuntime {
  update: (props: WorldMapProps) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  autoRotate: (enabled: boolean) => void;
  dispose: () => void;
}

/** One textured mesh, rendered on demand. No React commits during globe rotation. */
export function createThreeGlobe(host: HTMLDivElement, initial: WorldMapProps, onFailure: () => void): GlobeRuntime {
  const renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const css = getComputedStyle(host);
  const token = (name: string) => css.getPropertyValue(name).trim();
  renderer.setClearColor(token('--bg') || '#000000');
  const canvas = renderer.domElement;
  canvas.className = 'sentiment-globe-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Three.js event globe. Drag or use arrow keys to rotate; plus and minus to zoom.');
  const overlay = document.createElement('div');
  overlay.className = 'sentiment-globe-markers';
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 1024;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext('2d');
  if (!context) { renderer.dispose(); throw new Error('Country texture canvas unavailable'); }
  context.fillStyle = token('--sunk') || '#101010';
  context.fillRect(0, 0, 1024, 512);
  const projection = geoEquirectangular().translate([512, 256]).scale(1024 / (2 * Math.PI));
  const path = geoPath(projection, context);
  context.beginPath(); path(geoGraticule10());
  context.strokeStyle = token('--line') || '#303030'; context.lineWidth = 0.5; context.stroke();
  for (const country of WORLD_FEATURES.features) {
    context.beginPath(); path(country);
    context.fillStyle = token('--panel') || '#080808'; context.fill();
    context.strokeStyle = token('--line2') || '#4a4a4a'; context.lineWidth = 0.6; context.stroke();
  }
  const texture = new CanvasTexture(textureCanvas);
  texture.colorSpace = SRGBColorSpace;
  const geometry = new SphereGeometry(1, 64, 32);
  const material = new MeshBasicMaterial({ map: texture });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1.12, 1.12, 1.12, -1.12, 0.1, 10);
  host.append(canvas, overlay);
  host.dataset.globeRenderer = 'three-webgl';
  let props = initial;
  let lon = 20;
  let lat = 12;
  let zoom = 1;
  let width = 1;
  let height = 1;
  let frame = 0;
  let drawn = 0;
  let lastSpin = 0;
  let auto = false;
  let visible = true;
  let over = false;
  let dragging = false;
  let moved = false;
  let disposed = false;
  let releaseTimer = 0;
  let start = { x: 0, y: 0, lon: 20, lat: 12 };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const nodes = new Map<string, HTMLButtonElement>();
  const point = new Vector3();
  const direction = new Vector3();
  const spinning = () => auto && visible && !document.hidden && !motion.matches && !over && !dragging && !props.selectedKey;

  const markerColor = (marker: GlobeMarker) => {
    if (marker.events.length === 1) return CATEGORY_COLOR[marker.events[0].category];
    const score = marker.events.reduce((sum, e) => sum + (e.sentiment === 'positive' ? 1 : e.sentiment === 'negative' ? -1 : 0), 0);
    return score > 0 ? 'var(--up)' : score < 0 ? 'var(--down)' : 'var(--mut)';
  };

  const updateMarkers = () => {
    direction.copy(camera.position).normalize();
    const placed: { event: WorldMapProps['events'][number]; x: number; y: number }[] = [];
    for (const event of props.events) {
      if (props.activeCats && !props.activeCats.has(event.category)) continue;
      if (!Number.isFinite(event.lon) || !Number.isFinite(event.lat) || Math.abs(event.lat) > 90) continue;
      point.set(...globePoint(event.lon, event.lat));
      if (point.dot(direction) <= 0) continue;
      point.project(camera);
      if (Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05) continue;
      placed.push({ event, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 });
    }
    const markers = clusterGlobeMarkers(placed, Math.max(12, 30 / zoom));
    const keep = new Set<string>();
    for (const marker of markers) {
      keep.add(marker.key);
      let button = nodes.get(marker.key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'sentiment-globe-marker';
        overlay.append(button);
        nodes.set(marker.key, button);
      }
      const single = marker.events.length === 1 ? marker.events[0] : null;
      const radius = single ? impactRadius(single.impact) * 1.15 : 9 + Math.log2(marker.events.length) * 3.5;
      button.style.left = `${marker.x}px`;
      button.style.top = `${marker.y}px`;
      button.style.setProperty('--marker-color', markerColor(marker));
      button.style.setProperty('--marker-size', `${radius * 2}px`);
      button.style.width = button.style.height = `${Math.max(22, radius * 2 + 6)}px`;
      button.textContent = single ? '' : String(marker.events.length);
      button.title = single ? `${single.headline} · ${single.place}` : `${marker.events.length} events · ${marker.place}`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(single ? props.selectedKey === single.id : false));
      button.onclick = (event) => {
        event.stopPropagation();
        if (moved) return;
        if (single) {
          props.onSelectKey(single.id);
          props.onOpenDetail({ kind: 'event', event: single });
        } else {
          props.onSelectKey(marker.key);
          props.onOpenDetail({ kind: 'cluster', events: marker.events, place: marker.place });
        }
      };
    }
    for (const [key, node] of nodes) if (!keep.has(key)) { node.remove(); nodes.delete(key); }
  };

  const paint = (time: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    const spin = spinning();
    if (spin && lastSpin && time - lastSpin < 1000 / 30) { requestRender(); return; }
    if (spin) { lon += Math.min(lastSpin ? time - lastSpin : 33, 100) * 0.0045; lastSpin = time; }
    else lastSpin = 0;
    camera.position.set(...globePoint(lon, lat)).multiplyScalar(3);
    camera.lookAt(0, 0, 0);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    try {
      renderer.render(scene, camera);
      updateMarkers();
      host.dataset.globeFrames = String(++drawn);
      host.dataset.globeDrawCalls = String(renderer.info.render.calls);
    } catch { onFailure(); return; }
    if (spin) requestRender();
  };
  function requestRender() {
    if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(paint);
  }
  const sync = () => { cancelAnimationFrame(frame); frame = 0; lastSpin = 0; requestRender(); };
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    camera.left = -1.12 * Math.max(aspect, 1); camera.right = -camera.left;
    camera.top = 1.12 * Math.max(1, 1 / aspect); camera.bottom = -camera.top;
    renderer.setSize(width, height, false);
    requestRender();
  };
  const zoomBy = (factor: number) => { zoom = Math.max(0.7, Math.min(4, zoom * factor)); requestRender(); };
  const reset = () => { lon = 20; lat = 12; zoom = 1; requestRender(); };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true; moved = false;
    start = { x: event.clientX, y: event.clientY, lon, lat };
    canvas.style.cursor = 'grabbing';
  };
  const move = (event: PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    lon = start.lon - dx * 0.26;
    lat = Math.max(-89, Math.min(89, start.lat + dy * 0.26));
    requestRender();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false; canvas.style.cursor = 'grab'; requestRender();
    // Suppress the click immediately after a drag, then allow later marker clicks.
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => { moved = false; }, 0);
  };
  const click = () => { if (!moved) { props.onSelectKey(null); props.onOpenDetail(null); } };
  const wheel = (event: WheelEvent) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12); };
  const enter = () => { over = true; };
  const leave = () => { over = false; lastSpin = 0; requestRender(); };
  const keys = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') lon -= 10;
    if (event.key === 'ArrowRight') lon += 10;
    if (event.key === 'ArrowUp') lat = Math.min(89, lat + 10);
    if (event.key === 'ArrowDown') lat = Math.max(-89, lat - 10);
    if (event.key === '+' || event.key === '=') zoomBy(1.4);
    if (event.key === '-') zoomBy(1 / 1.4);
    if (event.key === 'Home') reset();
    requestRender();
  };
  const lost = (event: Event) => { event.preventDefault(); onFailure(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('click', click);
  canvas.addEventListener('keydown', keys);
  canvas.addEventListener('webglcontextlost', lost);
  host.addEventListener('wheel', wheel, { passive: false });
  host.addEventListener('pointerenter', enter);
  host.addEventListener('pointerleave', leave);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  visibilityObserver.observe(host);
  resize();

  return {
    update: (next) => { props = next; requestRender(); }, zoom: zoomBy, reset,
    autoRotate: (enabled) => { auto = enabled; sync(); },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(releaseTimer);
      sizeObserver.disconnect(); visibilityObserver.disconnect();
      host.removeEventListener('wheel', wheel); host.removeEventListener('pointerenter', enter); host.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', sync);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('click', click); canvas.removeEventListener('keydown', keys); canvas.removeEventListener('webglcontextlost', lost);
      geometry.dispose(); material.dispose(); texture.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.remove(); overlay.remove(); nodes.clear();
      delete host.dataset.globeRenderer; delete host.dataset.globeFrames; delete host.dataset.globeDrawCalls;
    },
  };
}
