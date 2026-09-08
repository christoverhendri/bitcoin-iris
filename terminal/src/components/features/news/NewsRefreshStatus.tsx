'use client';

import type { useLiveNews } from './useLiveNews';

export function NewsRefreshStatus({ news, failed, refreshing, refresh }: ReturnType<typeof useLiveNews>) {
  if (process.env.NODE_ENV !== 'development') return null;
  const degraded = failed || news.isMock || news.feeds?.some((feed) => feed.status !== 'ok');
  const checked = news.feeds?.map((feed) => feed.checkedAt).sort().at(-1);
  return <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--mut)' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{degraded ? 'NEWS DEGRADED · latest available stories' : 'RSS · SSE PUSH'} · newest first</span>
      <button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? 'Checking…' : 'Reconnect news'}</button>
    </div>
    <details>
      <summary>Feed status{checked ? ` · checked ${checked.replace('T', ' ').slice(0, 19)} UTC` : ''}</summary>
      {news.feeds?.map((feed) => <div key={feed.source}>
        {feed.source}: {feed.status.toUpperCase()} · last success {feed.fetchedAt?.replace('T', ' ').slice(0, 19) ?? 'never'} UTC
      </div>)}
      <div>Publisher updates determine delivery delay. RSS uses headline heuristics; Watcher uses canonical semantic evidence.</div>
    </details>
  </div>;
}
