import { getAllSourceStatus, type SourceStatusRow } from '@/lib/sourceStatus';
import { getSupabase } from '@/lib/supabase/server';
import { ENABLED_SOURCE_COUNT } from '@/lib/sources';
import type { SourceKey } from '@/lib/envelope';
import type { FeedHealth } from '@/components/shell/StatusFooter';

/**
 * Powers the rail footer and `/api/health`.
 *
 * Deliberately not a `defineFeature` — there is no mock variant. When nothing is
 * reporting, the honest answer is `0/17`, not a fabricated `17/17`.
 */

/**
 * Count sources with an observed, recent successful ingestion. Catalogue rows
 * and direct-fetch implementation details are deliberately not evidence of
 * health; until a writer records a success, the source remains unknown.
 *
 * Pure and exported so it can be tested without a database.
 */
export function computeObservedSources(rows: readonly SourceStatusRow[], now = Date.now()): Set<SourceKey> {
  return new Set(rows.filter((r) => {
    if (!r.is_enabled || r.mode !== 'live' || !r.last_success_at) return false;
    const at = Date.parse(r.last_success_at);
    return Number.isFinite(at) && at <= now && now - at <= 5 * 60 * 1000;
  }).map((r) => r.source_key));
}

export interface SyncReading {
  at: string | null;
}

/**
 * When the data on screen was last known good.
 *
 * A missing timestamp stays missing. The caller can therefore distinguish an
 * unobserved feed from one whose ingestion job has recently succeeded.
 */
export function computeSync(rows: readonly SourceStatusRow[], now = Date.now()): SyncReading {
  const reported = new Map<SourceKey, string>();
  for (const r of rows) {
    if (r.is_enabled && r.mode === 'live' && r.last_success_at) {
      const at = Date.parse(r.last_success_at);
      if (Number.isFinite(at) && at <= now) reported.set(r.source_key, r.last_success_at);
    }
  }

  const times = [...reported.values()].sort((a, b) => Date.parse(a) - Date.parse(b));
  return { at: times.length > 0 ? times[times.length - 1] : null };
}

export async function getFeedHealth(): Promise<FeedHealth> {
  const statuses = await getAllSourceStatus();
  const rows = [...statuses.values()];

  const enabled = rows.length > 0 ? rows.filter((r) => r.is_enabled).length : ENABLED_SOURCE_COUNT;
  const now = Date.now();
  const observedKeys = computeObservedSources(rows, now);
  const sync = computeSync(rows, now);

  const model = await getActiveModel();

  return {
    observed: observedKeys.size,
    enabled,
    lastSyncAt: sync.at,
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
  return !Number.isFinite(t) || t > now || now - t > 5 * 60 * 1000;
}
