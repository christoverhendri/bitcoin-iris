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
  /**
   * Server time the footer was computed at (epoch ms). Ages are formatted
   * against it on both server and client, so hydration sees the same text.
   */
  renderedAt: number;
}

/**
 * The page footer: how many data feeds are alive, which model version is
 * running, when the data last synced, and the disclaimer. Everything here is
 * read from `data_source_status` and `model_registry`, so it cannot claim a
 * feed is live while the panel above it shows placeholder data.
 */
export function StatusFooter({ health, now }: { health: FeedHealth; now?: number }) {
  const allLive = health.live === health.enabled && health.enabled > 0;
  const someLive = health.live > 0;

  return (
    <footer
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '28px 0 36px',
        fontSize: 13,
        color: 'var(--dim)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--mut)' }}>
          <span
            className={allLive ? 'iris-pulse' : undefined}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: someLive ? 'var(--accent)' : 'var(--dim)',
            }}
          />
          {health.live} of {health.enabled} feeds live
        </span>
        <span title={health.modelIsPlaceholder ? 'Rule-based placeholder, not a trained model' : health.modelName}>
          Model {health.modelVersion}
        </span>
        <span
          title={
            health.syncFromDirectFetch
              ? 'No ingestion job reports for the live feeds yet: they are fetched directly on render. Each panel footer shows its own data age, and a STALE badge when that age is too old.'
              : 'Newest success reported by an ingestion job.'
          }
        >
          {/* Never the render time dressed up as an age. */}
          Sync {health.syncFromDirectFetch ? 'direct on render' : fmtAgo(health.lastSyncAt, now ?? health.renderedAt)}
        </span>
      </span>
      <span>For research only. Not financial advice. IRIS BTC © {new Date(health.renderedAt).getUTCFullYear()}</span>
    </footer>
  );
}
