import { getNews } from '@/lib/features/news';
import { newsPage } from '@/lib/features/news/paging';
import { createNewsHub } from '@/lib/newsHub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const hub = createNewsHub(async () => {
  const news = await getNews({ limit: 8000 });
  return { ...news, ...newsPage(news.data, null) };
});

export function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      const timers: { heartbeat?: ReturnType<typeof setInterval>; lifetime?: ReturnType<typeof setTimeout> } = {};
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(timers.heartbeat);
        clearTimeout(timers.lifetime);
        request.signal.removeEventListener('abort', close);
      };
      const close = () => { cleanup(); try { controller.close(); } catch { /* already cancelled */ } };
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); }
      };
      if (request.signal.aborted) { close(); return; }
      request.signal.addEventListener('abort', close, { once: true });
      send('retry: 3000\n\n');
      unsubscribe = hub.subscribe((news) => {
        send(news ? `event: news\ndata: ${JSON.stringify(news)}\n\n` : 'event: unavailable\ndata: {}\n\n');
      });
      timers.heartbeat = setInterval(() => send(': heartbeat\n\n'), 15_000);
      // Bound connections; EventSource reconnects and receives a fresh snapshot.
      timers.lifetime = setTimeout(close, 240_000);
    },
    cancel() { cleanup(); },
  });
  return new Response(body, { headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  } });
}
