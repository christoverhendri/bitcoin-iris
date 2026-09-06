import { fmtAgo } from '@/lib/format';

export interface FeedHealth {
  /** Sources currently reporting `mode = 'live'`. */
  live: number;
  /** Sources that are enabled at all. */
  enabled: number;
  /** Newest `last_success_at` across all sources, ISO. */
  lastSyncAt: string | null;
  /**
   * True when `lastSyncAt` is the current time standing in for direct-fetch
   * sources, rather than a success any job reported. The tooltip says so — this
   * number used to be `new Date()` with nothing on screen admitting it.
   */
  syncFromDirectFetch: boolean;
  modelName: string;
  modelVersion: string;
  modelIsPlaceholder: boolean;
}

/**
 * The pinned rail footer: `FEEDS 4/17 · MODEL v0.9.2 · SYNC 2m ago`.
 * Everything here is read from `data_source_status` and `model_registry`, so it
 * cannot claim a feed is live while the panel above it shows placeholder data.
 */
export function StatusFooter({ health, now }: { health: FeedHealth; now?: number }) {
  const allLive = health.live === health.enabled && health.enabled > 0;
  const someLive = health.live > 0;
  const feedsTone = allLive ? 'var(--up)' : someLive ? 'var(--amber)' : 'var(--dim)';

  return (
    <div
      className="iris-micro"
      style={{
        borderTop: '1px solid var(--line)',
        padding: '9px 13px',
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        display: 'grid',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--dim)' }}>FEEDS</span>
        <span style={{ color: feedsTone }}>
          {health.live}/{health.enabled}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--dim)' }}>MODEL</span>
        <span
          style={{ color: health.modelIsPlaceholder ? 'var(--amber)' : 'var(--txt)' }}
          title={health.modelIsPlaceholder ? 'Rule-based placeholder, not a trained model' : undefined}
        >
          {health.modelVersion}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--dim)' }}>SYNC</span>
        <span
          style={{ color: 'var(--mut)' }}
          title={
            health.syncFromDirectFetch
              ? 'Direct-fetch sources report no success timestamp. Their responses are at most one revalidate window old, so the current time stands in.'
              : 'Newest success reported by an ingestion job.'
          }
        >
          {fmtAgo(health.lastSyncAt, now)}
          {health.syncFromDirectFetch ? '*' : ''}
        </span>
      </div>
    </div>
  );
}
