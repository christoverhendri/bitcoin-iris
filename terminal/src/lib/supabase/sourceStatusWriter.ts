import 'server-only';
import type { SourceKey } from '@/lib/envelope';
import { getSupabaseAdmin } from './admin';

/**
 * Reports what an ingestion run actually did into `data_source_status`.
 *
 * This is the half of the status table that makes it worth having. The seed
 * gives every source a catalogue row at `mode = 'unknown'`; without a writer,
 * that is all any row would ever say, and the rail footer and MOCK tooltips
 * would keep running on static assumptions.
 *
 * It lives here rather than inside the whale route so the second ingestion job
 * reuses it instead of copying it.
 *
 * Failure policy: a status write is bookkeeping. It must never fail the run that
 * produced the data — the rows that matter are already committed by the time
 * this is called, and the next run overwrites whatever this one failed to say.
 */

export interface IngestSuccess {
  source: SourceKey;
  /** Rows written this run. */
  rowCount: number;
  /** Defaults to now. Injectable for tests. */
  at?: Date;
}

export interface IngestFailure {
  source: SourceKey;
  error: string;
  at?: Date;
}

/** Truncated so a stack trace or an HTML error page cannot bloat the row. */
const MAX_ERROR = 500;

export async function reportIngestSuccess({
  source,
  rowCount,
  at = new Date(),
}: IngestSuccess): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const iso = at.toISOString();
  try {
    const { error } = await db
      .from('data_source_status')
      .update({
        mode: 'live',
        last_attempt_at: iso,
        last_success_at: iso,
        last_error: null,
        last_row_count: rowCount,
        consecutive_failures: 0,
      })
      .eq('source_key', source);
    if (error) console.error('[sourceStatus] success write', source, error.message);
  } catch (err) {
    console.error('[sourceStatus] success write', source, err);
  }
}

export async function reportIngestFailure({
  source,
  error,
  at = new Date(),
}: IngestFailure): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const iso = at.toISOString();
  try {
    // Read-then-write rather than a SQL increment: PostgREST has no expression
    // update, and the alternative is an RPC for one counter. Two concurrent
    // ingestion runs could lose a tick here — acceptable, because the counter is
    // an ops hint and the mode beside it is not raced.
    const { data } = await db
      .from('data_source_status')
      .select('consecutive_failures')
      .eq('source_key', source)
      .maybeSingle();

    const prev = Number((data as { consecutive_failures?: number } | null)?.consecutive_failures);
    const failures = (Number.isFinite(prev) ? prev : 0) + 1;

    const { error: writeError } = await db
      .from('data_source_status')
      .update({
        // One miss is a blip; a run of them is an outage. `degraded` keeps the
        // source counted while `failed` removes it from the live tally, so the
        // footer does not flicker on a single dropped request.
        mode: failures >= 3 ? 'failed' : 'degraded',
        last_attempt_at: iso,
        last_error: error.slice(0, MAX_ERROR),
        consecutive_failures: failures,
      })
      .eq('source_key', source);
    if (writeError) console.error('[sourceStatus] failure write', source, writeError.message);
  } catch (err) {
    console.error('[sourceStatus] failure write', source, err);
  }
}
