import type { SourceKey } from '@/lib/envelope';

/**
 * What the most recent feature resolutions said about each source's freshness.
 *
 * The sidebar's FEEDS count is rendered by the layout, which has no view of the
 * envelopes a page produces. `defineFeature` records each resolution here, and
 * `getFeedHealth` downgrades any source whose last reading was stale. It is
 * per server process and best effort: on a cold serverless instance the map is
 * empty and the count falls back to the static catalogue, exactly as before.
 *
 * A source with several features (e.g. `rss`) counts as stale while ANY of its
 * features last resolved stale.
 */
interface Reading {
  stale: boolean;
  at: number;
}

const readings = new Map<SourceKey, Map<string, Reading>>();

/** Readings older than this are ignored: nobody has looked at that page lately. */
export const FRESHNESS_WINDOW_MS = 30 * 60 * 1000;

export function recordFreshness(source: SourceKey, featureKey: string, stale: boolean, now = Date.now()) {
  let byFeature = readings.get(source);
  if (!byFeature) readings.set(source, (byFeature = new Map()));
  byFeature.set(featureKey, { stale, at: now });
}

/** Sources with at least one recent stale reading. */
export function staleSources(now = Date.now()): Set<SourceKey> {
  const out = new Set<SourceKey>();
  for (const [source, byFeature] of readings) {
    for (const r of byFeature.values()) {
      if (r.stale && now - r.at <= FRESHNESS_WINDOW_MS) {
        out.add(source);
        break;
      }
    }
  }
  return out;
}

/** Test hook. */
export function resetFreshness() {
  readings.clear();
}
