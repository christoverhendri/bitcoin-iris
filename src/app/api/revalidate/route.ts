/**
 * Daily refresh trigger for the Quant pages, so they turn over even when nobody
 * visits (IRIS_koreksi_auto_compute.md §4). Point an external cron at it once a
 * day after the daily close is published, e.g. 00:30 UTC:
 *
 *   curl -X POST https://<host>/api/revalidate -H "authorization: Bearer $CRON_SECRET"
 *
 * In a Route Handler `revalidatePath` marks each page stale; the page is rebuilt
 * on its next visit (Next 16 docs, functions/revalidatePath).
 */
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { SECTION_BY_KEY, subHref } from '@/lib/nav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET not set — revalidation is disabled' }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const quant = SECTION_BY_KEY.get('quant')!;
  const paths = quant.subs.map((s) => subHref(quant, s));
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: paths });
}
