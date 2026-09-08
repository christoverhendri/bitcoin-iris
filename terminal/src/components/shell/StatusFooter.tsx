import { fmtAgo } from '@/lib/format';

export interface FeedHealth {
  /** Sources with a successful, observed ingestion result. */
  observed: number;
  /** Sources that are enabled at all. */
  enabled: number;
  /** Newest valid success from enabled reporting sources, ISO. */
  lastSyncAt: string | null;
  modelName: string;
  modelVersion: string;
  modelIsPlaceholder: boolean;
}

/**
 * The pinned rail footer: `OBSERVED 4/17 · MODEL v0.9.2 · SYNC 2m ago`.
 * Reports come from `data_source_status` and `model_registry`. This summarizes
 * recent ingestion observations; it is not a guarantee that every panel query succeeds.
 */
export function StatusFooter({ health, now }: { health: FeedHealth; now?: number }) {
  const allObserved = health.observed === health.enabled && health.enabled > 0;
  const someObserved = health.observed > 0;
  const feedsTone = allObserved ? 'var(--up)' : someObserved ? 'var(--amber)' : 'var(--dim)';

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
        <span style={{ color: 'var(--dim)' }}>OBSERVED</span>
        <span style={{ color: feedsTone }}>
          {health.observed}/{health.enabled}
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
            'Newest successful observation reported by an ingestion job.'
          }
        >
          {/* Use the serialized server snapshot, never the hydration-time clock. */}
          {now !== undefined ? fmtAgo(health.lastSyncAt, now) : health.lastSyncAt ? health.lastSyncAt.replace('T', ' ').slice(0, 16) + ' UTC' : 'UNKNOWN'}
        </span>
      </div>
    </div>
  );
}
