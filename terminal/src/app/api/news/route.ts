import { getNews } from '@/lib/features/news';
import { newsPage } from '@/lib/features/news/paging';

export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor) {
    try { newsPage([], cursor); } catch { return Response.json({ error: 'Invalid cursor' }, { status: 400 }); }
  }
  const news = await getNews({ limit: 8000 });
  return Response.json({ ...news, ...newsPage(news.data, cursor) }, { headers: { 'cache-control': 'no-store' } });
}
