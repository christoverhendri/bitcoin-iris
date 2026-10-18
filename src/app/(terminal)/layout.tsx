import { Suspense, type ReactNode } from 'react';
import {
  AppShell,
  CountryScopeTabs,
  Disclaimer,
  Sidebar,
  SubTabs,
  TimeframePills,
  Topbar,
} from '@/components/shell';
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
    <AppShell sidebar={<Sidebar health={health} />}>
      {/* Every page re-renders from the server every 30s while the tab is visible. */}
      <AutoRefresh intervalSec={30} />
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
      {/* nuqs reads the query string, so these must sit behind a Suspense
          boundary or the whole route opts out of static prerendering. */}
      <Suspense fallback={null}>
        <CountryScopeTabs />
      </Suspense>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '0 16px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--sunk)',
          flexShrink: 0,
        }}
      >
        <SubTabs />
        <Suspense fallback={null}>
          <TimeframePills />
        </Suspense>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', minHeight: 0, minWidth: 0 }}>
        {children}
        <Disclaimer />
      </main>
    </AppShell>
  );
}
