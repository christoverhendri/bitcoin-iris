import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Read-only Supabase client for server components.
 *
 * Returns `null` when the project is not configured yet. That is deliberate:
 * every feature module already handles a null/empty result by falling back to
 * the mock layer, so an unconfigured checkout renders the full terminal with
 * MOCK badges instead of crashing. There is no separate "demo mode" branch.
 *
 * Only the publishable (anon) key belongs here. The service role key is the
 * worker's alone and must never reach the web app.
 */
export type Db = SupabaseClient<Database>;

let cached: Db | null | undefined;

export function getSupabase(): Db | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const isSupabaseConfigured = () => getSupabase() !== null;

/**
 * Narrows a PostgREST result to the row shape the caller declared.
 *
 * Needed only while `database.types.ts` is a placeholder: PostgREST's select
 * parser cannot resolve column names against an index-signature Row, so the
 * result widens to an error union. Each `live.ts` therefore declares the exact
 * columns it selected as a local interface — which is worth keeping even after
 * the generated types land, because it documents the query at the call site.
 */
export const asRow = <T>(value: unknown): T => value as T;
