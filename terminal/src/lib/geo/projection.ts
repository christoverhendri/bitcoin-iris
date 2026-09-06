/**
 * World geometry + a Natural Earth projection, shared by the map component and
 * the marker placement helper. Runs on the server (SSR) and the client alike —
 * the topology is a bundled JSON import, no fetch.
 */
import { geoNaturalEarth1, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import world from './world-110m.json';

const topology = world as unknown as Topology;

const SPHERE = { type: 'Sphere' as const };

/** Decoded country polygons, computed once per process. */
export const WORLD_FEATURES: FeatureCollection<Geometry> = feature(
  topology,
  topology.objects.countries as GeometryCollection,
) as unknown as FeatureCollection<Geometry>;

export type WorldFeature = Feature<Geometry>;

interface ProjectionBundle {
  projection: GeoProjection;
  path: GeoPath;
}

const cache = new Map<string, ProjectionBundle>();

/**
 * A `geoNaturalEarth1` fitted to `width x height` plus its `geoPath`. Memoized
 * per size so repeated renders and every `project()` call reuse one instance.
 */
export function makeProjection(width: number, height: number): ProjectionBundle {
  const key = `${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const projection = geoNaturalEarth1().fitSize([width, height], SPHERE);
  const bundle: ProjectionBundle = { projection, path: geoPath(projection) };
  cache.set(key, bundle);
  return bundle;
}

/** The `{ type: 'Sphere' }` outline path for a given size. */
export function spherePath(width: number, height: number): string {
  return makeProjection(width, height).path(SPHERE) ?? '';
}

/**
 * Lon/lat to pixel coordinates in the projected `width x height` box. Returns
 * `null` when the point does not project (behind the globe / invalid input).
 */
export function project(
  lon: number,
  lat: number,
  width = 960,
  height = 500,
): [number, number] | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const p = makeProjection(width, height).projection([lon, lat]);
  if (!p || Number.isNaN(p[0]) || Number.isNaN(p[1])) return null;
  return [p[0], p[1]];
}
