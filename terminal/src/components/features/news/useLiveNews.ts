'use client';

import { useEffect, useState } from 'react';
import type { Envelope } from '@/lib/envelope';
import type { NewsArticle } from '@/lib/features/news/types';
import type { FeedHealth } from '@/lib/sources/rss';

import { articleKey, compareNews } from '@/lib/features/news/paging';

export type NewsEnvelope = Envelope<NewsArticle[]> & { feeds?: FeedHealth[]; nextCursor?: string | null };

export function useLiveNews(initial: NewsEnvelope) {
  const [news, setNews] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<NewsArticle[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null | undefined>(undefined);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let stream: EventSource | undefined;
    const connect = () => {
      if (document.hidden || stream) return;
      setRefreshing(true);
      stream = new EventSource('/api/news/stream');
      stream.addEventListener('news', (event) => {
        try {
          const next: NewsEnvelope = JSON.parse((event as MessageEvent).data);
          if (!Array.isArray(next.data) || !Array.isArray(next.feeds)) throw new Error('Invalid news');
          setFailed(next.isMock || next.feeds.some((feed) => feed.status !== 'ok'));
          setNews((previous) => next.isMock && previous.data.length && previous.asOf && Date.now() - Date.parse(previous.asOf) < 86_400_000
            ? { ...previous, feeds: next.feeds } : next);
        } catch { setFailed(true); }
        setRefreshing(false);
      });
      stream.addEventListener('unavailable', () => { setFailed(true); setRefreshing(false); });
      stream.onerror = () => { setFailed(true); setRefreshing(false); };
    };
    const visibility = () => {
      if (document.hidden) { stream?.close(); stream = undefined; }
      else connect();
    };
    connect();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stream?.close();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [request]);
  const combined = new Map(history.map((article) => [articleKey(article), article]));
  for (const article of news.data) combined.set(articleKey(article), article);
  const cursor = historyCursor === undefined ? news.nextCursor : historyCursor;
  const loadHistory = async () => {
    if (!cursor || loadingHistory) return;
    setLoadingHistory(true);
    setHistoryError(false);
    try {
      const response = await fetch(`/api/news?cursor=${encodeURIComponent(cursor)}`, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
      if (!response.ok) throw new Error('History unavailable');
      const page: NewsEnvelope = await response.json();
      if (!Array.isArray(page.data)) throw new Error('Invalid history');
      setHistory((old) => [...old, ...page.data]);
      setHistoryCursor(page.nextCursor ?? null);
    } catch { setHistoryError(true); }
    finally { setLoadingHistory(false); }
  };
  return { news: { ...news, data: [...combined.values()].sort(compareNews) }, failed, refreshing,
    loadHistory, loadingHistory, historyError, hasHistory: !!cursor,
    refresh: () => setRequest((value) => value + 1) };

}
