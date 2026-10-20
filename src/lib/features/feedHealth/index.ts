import { getAllSourceStatus, type SourceStatusRow } from '@/lib/sourceStatus';
import { getSupabase } from '@/lib/supabase/server';
import { SOURCES } from '@/lib/sources';
import { staleSources } from '@/lib/freshness';
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
  stale: ReadonlySet<SourceKey> = new Set(),
  enabled?: ReadonlySet<SourceKey>,
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
  // A source whose last reading was stale (or failed) is degraded, not live —
  // its numbers may be a cached response from an upstream that is down.
  for (const k of stale) live.delete(k);
  // Only active sources can count: FEEDS n/N must never show n from outside N.
  if (enabled) for (const k of [...live]) if (!enabled.has(k)) live.delete(k);
  return live;
}

/** Active sources: the database's flags when it has rows, else the static catalogue. */
export function enabledSources(rows: readonly SourceStatusRow[]): Set<SourceKey> {
  if (rows.length > 0) return new Set(rows.filter((r) => r.is_enabled).map((r) => r.source_key));
  return new Set(SOURCES.filter((s) => s.enabled).map((s) => s.key));
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

  const enabledKeys = enabledSources(rows);
  const enabled = enabledKeys.size;
  const liveKeys = computeLiveSources(rows, WIRED_SOURCES, staleSources(), enabledKeys);
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
    renderedAt: Date.now(),
  };
}

/**
 * Without a model registry (no Supabase), the model actually serving the
 * weekly panel is the one that wrote the worker's local signal file. Reporting
 * "v0-placeholder" while that trained model is live would understate it.
 */
async function localSignalModel(): Promise<{ name: string; version: string; isPlaceholder: boolean } | null> {
  const file = process.env.CLF_LOCAL_SIGNAL_FILE;
  if (!file) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const row = JSON.parse(await readFile(file, 'utf8')) as {
      model_name?: string;
      model_created_utc?: string;
      is_synthetic?: boolean;
    };
    if (typeof row.model_name !== 'string') return null;
    return {
      name: row.model_name,
      version: `clf_7d · ${(row.model_created_utc ?? '').slice(0, 10) || 'unknown'}`,
      isPlaceholder: row.is_synthetic === true,
    };
  } catch {
    return null;
  }
}

async function getActiveModel(): Promise<{ name: string; version: string; isPlaceholder: boolean }> {
  const placeholder = { name: 'weekly_regime', version: 'v0-placeholder', isPlaceholder: true };
  const sb = getSupabase();
  const fallback = sb ? placeholder : ((await localSignalModel()) ?? placeholder);
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
