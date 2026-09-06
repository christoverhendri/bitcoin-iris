/**
 * Whale Alert ingestion. Pull recent transfers, upsert them, prune old ones.
 *
 * This is the repository's only writer. It exists because the Whale Alert free
 * tier has no history: a single call sees the last ~10 minutes, so the feed's
 * memory has to be built one call at a time. Point an external scheduler
 * (cron-job.org, UptimeRobot, a VPS crontab) at it every 5 minutes:
 *
 *   curl -X POST https://<host>/api/ingest/whale \
 *     -H "authorization: Bearer $CRON_SECRET"
 *
 * Every five minutes with a ten-minute lookback means consecutive runs overlap
 * by design — a late or skipped run loses nothing, and the overlap costs nothing
 * because `id` is the primary key and the write is an upsert.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getWhaleTransactions, isWhaleAlertEnabled } from '@/lib/sources/whaleAlert';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { reportIngestFailure, reportIngestSuccess } from '@/lib/supabase/sourceStatusWriter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rows older than this are dropped at the end of each run. */
const RETENTION_DAYS = 30;

async function ingest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured means no safe way to expose this route. Closed, not
    // open — the failure mode of the alternative is an unauthenticated writer.
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not set — ingestion is disabled' },
      { status: 503 },
    );
  }
  if (!isAuthorizedCron(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if (!isWhaleAlertEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'WHALE_ALERT_API_KEY not set' },
      { status: 503 },
    );
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unconfigured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 },
    );
  }

  let transfers;
  try {
    transfers = await getWhaleTransactions();
  } catch (err) {
    // Report the upstream failure rather than swallowing it: a scheduler that
    // sees 502 can alert, while a silent 200 with zero rows looks like a quiet
    // market and would hide a dead key for days.
    console.error('[ingest:whale] upstream', err);
    const message = err instanceof Error ? err.message : 'upstream failed';
    // Record the miss before returning, so a dead key shows up in the rail
    // footer and /api/health rather than only in a scheduler's alert inbox.
    await reportIngestFailure({ source: 'whale_alert', error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502 },
    );
  }

  let inserted = 0;
  if (transfers.length > 0) {
    const rows = transfers.map((t) => ({
      id: t.id,
      ts: new Date(t.ts * 1000).toISOString(),
      blockchain: t.blockchain,
      symbol: t.symbol,
      amount: t.amount,
      amount_usd: t.amountUsd,
      from_label: t.fromLabel,
      to_label: t.toLabel,
      kind: t.kind,
      bias: t.bias,
      impact: t.impact,
      tx_url: t.txUrl,
      is_synthetic: false,
    }));

    const { error } = await db.from('whale_events').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('[ingest:whale] upsert', error);
      await reportIngestFailure({ source: 'whale_alert', error: error.message });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    inserted = rows.length;
  }

  // Retention. Without it the table grows for as long as the cron runs.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { error: pruneError, count: pruned } = await db
    .from('whale_events')
    .delete({ count: 'exact' })
    .lt('ts', cutoff);

  // A failed prune is not a failed ingestion — the rows that matter are already
  // written, and the next run tries again.
  if (pruneError) console.error('[ingest:whale] prune', pruneError);

  // A run that fetched zero transfers still succeeded: whales are not obliged to
  // move every five minutes. Reporting it as a failure would make a quiet market
  // look like an outage.
  await reportIngestSuccess({ source: 'whale_alert', rowCount: inserted });

  return NextResponse.json({
    ok: true,
    fetched: transfers.length,
    inserted,
    pruned: pruned ?? 0,
  });
}

export async function POST(request: Request) {
  return ingest(request);
}

/**
 * Some free schedulers only send GET. Same guard, same work — the bearer token
 * is what protects this, not the verb.
 */
export async function GET(request: Request) {
  return ingest(request);
}
