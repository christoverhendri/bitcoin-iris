'use client';

import { useEffect, useState } from 'react';
import { Panel, PanelHeader } from '@/components/primitives';
import type { MinuteBackfillProgress } from '@/lib/minuteBackfill';

const count = (n: number) => n.toLocaleString('en-US');
const duration = (seconds: number | null) => {
  if (seconds === null) return 'Estimating…';
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export function MinuteBackfillPanel() {
  const [data, setData] = useState<MinuteBackfillProgress | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        if (!document.hidden) {
          const response = await fetch('/api/market/backfill', { cache: 'no-store', signal: controller.signal });
          if (!response.ok) throw new Error('Unavailable');
          const value: MinuteBackfillProgress = await response.json();
          if (!stopped) { setData(value); setError(false); }
        }
      } catch { if (!stopped) setError(true); }
      finally { if (!stopped) timer = setTimeout(poll, 30000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, []);
  const state = error ? 'UNAVAILABLE' : data?.state.toUpperCase() ?? 'LOADING';
  return <section aria-label="Minute backfill progress" style={{ padding: '12px 12px 0' }}>
    <Panel><PanelHeader title="MINUTE BACKFILL" note="COINBASE BTC/USD · DEV" right={<span role="status">{state}</span>} />
      <div className="market-research-body">
        {data ? <>
          <div className="minute-backfill-progress"><label htmlFor="minute-backfill-coverage">Request coverage <strong>{data.percent.toFixed(1)}%</strong></label>
            <progress id="minute-backfill-coverage" max={100} value={data.percent} />
          </div>
          <dl className="market-coverage-grid">
            <div><dt>Stored minute candles</dt><dd>{count(data.collectedMinutes)}</dd></div>
            <div><dt>Estimated time remaining</dt><dd>{error ? '—' : data.state === 'complete' ? 'Finished' : data.state !== 'running' ? '— · collector inactive' : duration(data.remainingSeconds)}</dd></div>
            <div><dt>Successful request windows</dt><dd>{count(data.completedWindows)} / {count(data.totalWindows)}</dd></div>
            <div><dt>Monthly batches</dt><dd>{data.completedMonths} / {data.totalMonths} · {data.activeBatch ?? 'No active batch'}</dd></div>
            <div><dt>Recent collection rate</dt><dd>{!error && data.requestsPerMinute !== null ? `${data.requestsPerMinute.toFixed(1)} requests/min` : '—'}</dd></div>
            <div><dt>Status sampled at</dt><dd>{new Date(data.capturedAt).toLocaleTimeString()} · refreshes every 30s</dd></div>
          </dl>
          <details><summary>Collection range & checkpoint</summary>
            <p>{data.requestedStart} → {data.requestedEnd} · Latest successful fetch: {data.lastFetch ?? 'None'}</p>
            <p>Request coverage counts fetched windows, including empty responses. It does not certify candle completeness. Missing minutes remain absent; ETA varies with network speed and retries.</p>
          </details>
          {data.hasCollectorError && <p role="status">The collector reported an error. Check its local job logs.</p>}
        </> : <p role="status">{error ? 'Local minute backfill status is unavailable.' : 'Reading local collector progress…'}</p>}
        {error && data && <p role="status">Showing the last captured status; collection progress could not be refreshed.</p>}
      </div>
    </Panel>
  </section>;
}
