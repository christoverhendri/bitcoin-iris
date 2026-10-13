import type { GeoEvent } from '@/lib/features/geopoliticalEvents/types';

/** Matches Three.js SphereGeometry UVs and the equirectangular country texture. */
export function globePoint(lon: number, lat: number): [number, number, number] {
  const phi = lon * Math.PI / 180;
  const theta = lat * Math.PI / 180;
  return [Math.cos(theta) * Math.cos(phi), Math.sin(theta), -Math.cos(theta) * Math.sin(phi)];
}

export interface GlobeMarker {
  key: string;
  x: number;
  y: number;
  events: GeoEvent[];
  place: string;
}

export function clusterGlobeMarkers(placed: { event: GeoEvent; x: number; y: number }[], cell: number): GlobeMarker[] {
  const buckets = new Map<string, typeof placed>();
  for (const point of placed) {
    const key = `${Math.round(point.x / cell)},${Math.round(point.y / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  return [...buckets.entries()].map(([key, points]) => {
    const events = points.map((p) => p.event);
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.place, (counts.get(event.place) ?? 0) + 1);
    const place = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    return { key: events.length === 1 ? events[0].id : `cl-${key}`, events, place,
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  });
}
