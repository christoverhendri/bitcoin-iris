/**
 * Health endpoint. `feedHealth/index.ts` has claimed to power this since before
 * it existed; this is that claim made true.
 *
 * Built for an external uptime monitor — the same kind of service that drives
 * `/api/ingest/whale` — so the useful signal is the status code, not the body:
 * 200 while data is flowing, 503 once it is not. A monitor should not have to
 * parse JSON to notice an outage.
 *
 * Read-only and public. It exposes counts, timestamps and source keys — never a
 * key, a row, or an error containing either.
 */
import { NextResponse } from 'next/server';
import { getFeedHealth, isStale } from '@/lib/features/feedHealth';
import { ENABLED_SOURCE_COUNT } from '@/lib/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let health;
  try {
    health = await getFeedHealth();
  } catch (err) {
    // A health check that 500s on its own failure tells a monitor nothing useful.
    console.error('[health]', err);
    return NextResponse.json(
      { ok: false, error: 'health check failed', live: 0, enabled: ENABLED_SOURCE_COUNT },
      { status: 503 },
    );
  }

  const stale = isStale(health.lastSyncAt);
  const ok = health.live > 0 && !stale;

  return NextResponse.json(
    {
      ok,
      live: health.live,
      enabled: health.enabled,
      lastSyncAt: health.lastSyncAt,
      // Says whether `lastSyncAt` is a reported success or the current time
      // standing in for direct-fetch sources — without it a monitor cannot tell
      // a healthy terminal from one whose clock is the only thing still moving.
      syncFromDirectFetch: health.syncFromDirectFetch,
      stale,
      model: {
        name: health.modelName,
        version: health.modelVersion,
        isPlaceholder: health.modelIsPlaceholder,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
