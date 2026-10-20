/**
 * The pulsing LIVE indicator.
 *
 * `stale` turns it off deliberately: a pulsing LIVE dot over a five-minute-old
 * price is a credibility bug, not a cosmetic one.
 */
export function LiveBadge({ stale = false, reason }: { stale?: boolean; reason?: string }) {
  return (
    <span
      className="chip"
      title={stale ? (reason ?? 'Data is stale — the ingestion worker is not reporting') : 'Data is fresh'}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        background: '#1c140e',
        color: stale ? 'var(--dim)' : '#ffb27a',
      }}
    >
      <span
        className={stale ? undefined : 'iris-pulse'}
        style={{ width: 7, height: 7, borderRadius: '50%', background: stale ? 'var(--dim)' : 'var(--accent)' }}
      />
      {stale ? 'Stale' : 'Live'}
    </span>
  );
}
