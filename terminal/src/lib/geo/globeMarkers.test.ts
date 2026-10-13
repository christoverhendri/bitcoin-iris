import { describe, expect, it } from 'vitest';
import { globePoint, clusterGlobeMarkers } from './globeMarkers';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents/types';

const event = (id: string, place: string): GeoEvent => ({
  id, place, headline: id, source: 'fixture', publishedAt: 0, category: 'MARKET',
  sentiment: 'neutral', lon: 0, lat: 0, iso2: '', impact: 50,
});

describe('globe marker geography', () => {
  it('keeps geographic points on the sphere, with correct hemispheres and seam', () => {
    for (const [lon, lat] of [[0, 0], [90, 0], [20, 12], [-122, 38], [0, 90]]) {
      const p = globePoint(lon, lat);
      expect(Math.hypot(...p)).toBeCloseTo(1);
    }
    expect(globePoint(0, 0)[0]).toBe(1);
    expect(globePoint(90, 0)[2]).toBeCloseTo(-1);
    expect(globePoint(0, 90)[1]).toBeCloseTo(1);
    globePoint(180, 0).forEach((value, i) => expect(value).toBeCloseTo(globePoint(-180, 0)[i]));
  });

  it('preserves every event in clusters and splits them at higher zoom', () => {
    const placed = [
      { event: event('a', 'London'), x: 0, y: 0 },
      { event: event('b', 'London'), x: 10, y: 0 },
      { event: event('c', 'Paris'), x: 8, y: 2 },
      { event: event('d', 'Tokyo'), x: 200, y: 200 },
    ];
    const clustered = clusterGlobeMarkers(placed, 30);
    expect(clustered).toHaveLength(2);
    expect(clustered[0].place).toBe('London');
    expect(clustered.flatMap((c) => c.events.map((e) => e.id)).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(clusterGlobeMarkers(placed, 2)).toHaveLength(4);
    expect(clusterGlobeMarkers([], 30)).toEqual([]);
  });
});
