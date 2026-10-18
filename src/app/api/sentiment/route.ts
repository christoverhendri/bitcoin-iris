import { getNews } from '@/lib/features/news';
import { getSentiment } from '@/lib/features/sentiment';

export const dynamic = 'force-dynamic';

/** Read-only view of the same data the news and sentiment panels consume. */
export async function GET() {
  const [news, sentiment] = await Promise.all([getNews({ limit: 40 }), getSentiment({ days: 7 })]);
  return Response.json({ news, sentiment });
}
