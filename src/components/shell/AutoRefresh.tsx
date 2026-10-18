'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-renders the current page from the server every `intervalSec` while the tab
 * is visible, so prices, charts and badges move without a manual reload
 * (2026-10-18). `router.refresh()` keeps scroll position and client state; the
 * server still decides freshness through each fetch's revalidate window and the
 * stale-cache guard in `sources/http.ts`.
 *
 * A hidden tab does not poll; coming back to it refreshes at once.
 */
export function AutoRefresh({ intervalSec = 30 }: { intervalSec?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => router.refresh(), intervalSec * 1000);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalSec]);

  return null;
}
