import { readMinuteBackfill } from '@/lib/sources/minuteBackfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let cached: { at: number; value: ReturnType<typeof readMinuteBackfill> } | null = null;

export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  if (process.env.NODE_ENV !== 'development') return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    const now = Date.now();
    if (!cached || now - cached.at >= 30000) cached = { at: now, value: readMinuteBackfill(undefined, now) };
    return Response.json(cached.value, { headers });
  } catch {
    cached = null;
    return Response.json({ error: 'Local minute backfill status is unavailable.' }, { status: 503, headers });
  }
}
