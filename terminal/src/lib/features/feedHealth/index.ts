import { getAllSourceStatus, type SourceStatusRow } from '@/lib/sourceStatus';
import { getSupabase } from '@/lib/supabase/server';
import { ENABLED_SOURCE_COUNT } from '@/lib/sources';
import { WIRED_SOURCES } from '@/lib/sources/wired';
import type { SourceKey } from '@/lib/envelope';
import type { FeedHealth } from '@/components/shell/StatusFooter';

/**
 * Powers the rail footer and `/api/health`.
 *
 * Deliberately not a `defineFeature` — there is no mock variant. When nothing is
 * reporting, the honest answer is `0/17`, not a fabricated `17/17`.
 */

/**
 * Which sources are actually delivering real data.
 *
 * This used to be an either/or: with no `data_source_status` table it counted
 * `WIRED_SOURCES`, and the moment a single row existed it switched to counting
 * only rows reporting `mode = 'live'`. Seeding the catalogue would therefore
 * have dropped the footer from 11/17 to whatever handful of ingestion jobs
 * report a mode — a collapse with no failure behind it.
 *
 * So the table *corrects* the static assumption instead of replacing it:
 *
 *   - start from the sources whose `live.ts` genuinely fetches an upstream
 *   - a row reporting `live` adds one the static list did not know about
 *   - a row reporting `failed` / `degraded` / `mock`, or disabled entirely,
 *     removes one — the database is the authority when it has an opinion
 *   - `unknown` is not an opinion, and changes nothing
 *
 * Pure and exported so it can be tested without a database.
 */
export function computeLiveSources(
  rows: readonly SourceStatusRow[],
  wired: readonly SourceKey[] = WIRED_SOURCES,
): Set<SourceKey> {
  const live = new Set<SourceKey>(wired);

  for (const r of rows) {
    if (!r.is_enabled) {
      live.delete(r.source_key);
      continue;
    }
    if (r.mode === 'live') live.add(r.source_key);
    else if (r.mode === 'failed' || r.mode === 'degraded' || r.mode === 'mock') {
      live.delete(r.source_key);
    }
  }

  return live;
}

export interface SyncReading {
  at: string | null;
  /**
   * True when the timestamp is "now" standing in for direct-fetch sources rather
   * than a reported success. Drives the footer tooltip — the number was silently
   * fabricated before, which is the thing being fixed.
   */
  fromDirectFetch: boolean;
}

/**
 * When the data on screen was last known good.
 *
 * Direct-fetch sources never report a success timestamp — nothing writes one for
 * them — but their responses are at most one revalidate window old by
 * construction, so "now" is a defensible reading *while any of them is counted
 * live*. Once every live source is one that reports, the reported time is used
 * instead, and the tooltip says which of the two the reader is looking at.
 */
export function computeSync(
  rows: readonly SourceStatusRow[],
  liveKeys: ReadonlySet<SourceKey>,
  wired: readonly SourceKey[] = WIRED_SOURCES,
  now: Date = new Date(),
): SyncReading {
  const reported = new Map<SourceKey, string>();
  for (const r of rows) {
    if (r.last_success_at) reported.set(r.source_key, r.last_success_at);
  }

  const directFetchCounted = wired.some((k) => liveKeys.has(k) && !reported.has(k));
  if (directFetchCounted) return { at: now.toISOString(), fromDirectFetch: true };

  const times = [...reported.values()].sort();
  return { at: times.length > 0 ? times[times.length - 1] : null, fromDirectFetch: false };
}

export async function getFeedHealth(): Promise<FeedHealth> {
  const statuses = await getAllSourceStatus();
  const rows = [...statuses.values()];

  const enabled = rows.length > 0 ? rows.filter((r) => r.is_enabled).length : ENABLED_SOURCE_COUNT;
  const liveKeys = computeLiveSources(rows);
  const sync = computeSync(rows, liveKeys);

  const model = await getActiveModel();

  return {
    live: liveKeys.size,
    enabled,
    lastSyncAt: sync.at,
    syncFromDirectFetch: sync.fromDirectFetch,
    modelName: model.name,
    modelVersion: model.version,
    modelIsPlaceholder: model.isPlaceholder,
  };
}

async function getActiveModel(): Promise<{ name: string; version: string; isPlaceholder: boolean }> {
  const fallback = { name: 'weekly_regime', version: 'v0-placeholder', isPlaceholder: true };
  const sb = getSupabase();
  if (!sb) return fallback;
  try {
    const { data, error } = await sb
      .from('model_registry')
      .select('model_name, model_version, is_placeholder')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      name: data.model_name as string,
      version: data.model_version as string,
      isPlaceholder: data.is_placeholder as boolean,
    };
  } catch {
    return fallback;
  }
}

/** A feed is considered stale once nothing has succeeded for five minutes. */
export function isStale(lastSyncAt: string | null, now = Date.now()): boolean {
  if (!lastSyncAt) return true;
  const t = Date.parse(lastSyncAt);
  return !Number.isFinite(t) || now - t > 5 * 60 * 1000;
}
