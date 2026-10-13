import { ArchiveRequestError, ArchiveUnavailableError, readArchivePage } from '@/lib/sources/marketArchive';
import { unavailable } from '@/lib/envelope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  try {
    return Response.json(readArchivePage(new URL(request.url).searchParams), { headers });
  } catch (error) {
    if (error instanceof ArchiveRequestError) return Response.json({ error: error.message }, { status: 400, headers });
    const message = error instanceof ArchiveUnavailableError ? error.message : 'Local archive is unavailable';
    return Response.json({ ...unavailable([], 'coinbase', message), error: message, nextCursor: null }, { status: 503, headers });
  }
}
