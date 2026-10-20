import { Suspense, type ReactNode } from 'react';
import { CountryScopeTabs, PageHeading, StatusFooter, Topbar } from '@/components/shell';
import { getFeedHealth, isStale } from '@/lib/features/feedHealth';
import { getBtcSnapshot } from '@/lib/features/snapshot';
import { AutoRefresh } from '@/components/shell/AutoRefresh';
import { explainStale } from '@/lib/envelope';

/** The topbar ticker must not look stale under a pulsing LIVE dot. */
export const revalidate = 30;

export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const [health, snapshot] = await Promise.all([
    getFeedHealth(),
    getBtcSnapshot({ symbol: 'BTC-USD' }),
  ]);

  const workerStale = isStale(health.lastSyncAt);
  const staleReason = snapshot.isMock
    ? 'Price is a placeholder — the price source is unreachable.'
    : snapshot.isStale
      ? explainStale(snapshot)
      : workerStale
        ? 'The ingestion worker is not reporting.'
        : undefined;

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
      <div className="ember-glow" aria-hidden="true" />
      {/* Every page re-renders from the server every 30s while the tab is visible. */}
      <AutoRefresh intervalSec={30} />
      <div className="ember-page">
        <Topbar
          ticker={{
            symbol: 'BTC/USD',
            // A mocked snapshot shows no price at all rather than a placeholder one.
            price: snapshot.isMock ? null : snapshot.data.last,
            changePct: snapshot.isMock ? null : snapshot.data.change24hPct,
            stale: snapshot.isMock || snapshot.isStale || workerStale,
            staleReason,
          }}
        />
        <PageHeading />
        {/* nuqs reads the query string, so this must sit behind a Suspense
            boundary or the whole route opts out of static prerendering. */}
        <Suspense fallback={null}>
          <CountryScopeTabs />
        </Suspense>
        <main style={{ minWidth: 0 }}>{children}</main>
        <StatusFooter health={health} />
      </div>
    </div>
  );
}
