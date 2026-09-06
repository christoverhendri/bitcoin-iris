import { cache } from 'react';
import { asRow, getSupabase } from '@/lib/supabase/server';
import type { SourceKey } from '@/lib/envelope';

export interface SourceStatusRow {
  source_key: SourceKey;
  display_name: string;
  category: string;
  is_enabled: boolean;
  requires_key: boolean;
  mode: 'live' | 'mock' | 'degraded' | 'failed' | 'unknown';
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_row_count: number | null;
  consecutive_failures: number;
  unlock_note: string | null;
}

/**
 * One read of `data_source_status` per request, shared by every panel on the
 * page via React's request-scoped `cache`. Without this, a page with fourteen
 * panels would issue fourteen identical queries.
 *
 * Returns an empty map when Supabase is not configured or the query fails —
 * callers treat a missing row as "no status known" and fall back to mock.
 */
export const getAllSourceStatus = cache(async (): Promise<Map<SourceKey, SourceStatusRow>> => {
  const sb = getSupabase();
  if (!sb) return new Map();

  try {
    const { data, error } = await sb.from('data_source_status').select('*');
    if (error || !data) return new Map();
    return new Map(data.map((r) => {
      const row = asRow<SourceStatusRow>(r);
      return [row.source_key, row] as const;
    }));
  } catch {
    // A dead database must not take the page down with it.
    return new Map();
  }
});

export async function getSourceStatus(key: SourceKey): Promise<SourceStatusRow | null> {
  return (await getAllSourceStatus()).get(key) ?? null;
}
