/**
 * Read endpoint for the whale wire's 60s poll.
 *
 * It returns the `Envelope` untouched rather than a bare array: the client panel
 * has to keep rendering the MOCK badge and the source footnote after a refresh,
 * and the envelope is what carries that. Stripping it here would make the badge
 * correct only until the first poll.
 */
import { NextResponse } from 'next/server';
import { getWhaleEvents } from '@/lib/features/whaleEvents';

/**
 * Reading `limit` off the URL makes this route dynamic, so Next's `revalidate`
 * export would not apply — the `s-maxage` header below is what actually
 * collapses concurrent polls into one database round-trip at the edge.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(1, raw), MAX_LIMIT) : DEFAULT_LIMIT;

  // `getWhaleEvents` never throws — a dead database degrades to a badged mock,
  // so there is no error branch to write here.
  const env = await getWhaleEvents({ limit });

  return NextResponse.json(env, {
    headers: { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' },
  });
}
