import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Write client for the ingestion route. Service role — bypasses RLS.
 *
 * Kept in its own file, separate from `server.ts`, for one reason: `server.ts`
 * is imported by feature readers that run inside server components, and this key
 * must never travel with them. `import 'server-only'` at the top makes that
 * structural — any import chain reaching a client component fails the build
 * rather than shipping the key.
 *
 * `docs/ARCHITECTURE.md` originally reserved this key for a Python worker. That
 * worker does not exist in this repository, and a route handler guarded by
 * `CRON_SECRET` is the same trust boundary: server-only code, one caller, no
 * path to the browser. See `docs/DECISIONS.md`.
 *
 * Returns `null` when unconfigured, matching `getSupabase()` — the ingestion
 * route turns that into a 503 rather than a crash.
 */
export type AdminDb = SupabaseClient<Database>;

let cached: AdminDb | null | undefined;

export function getSupabaseAdmin(): AdminDb | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
