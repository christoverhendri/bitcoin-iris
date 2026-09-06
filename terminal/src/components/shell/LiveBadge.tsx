/**
 * The pulsing LIVE indicator — the only animation in the design.
 *
 * `stale` turns it off deliberately: a pulsing LIVE dot over a five-minute-old
 * price is a credibility bug, not a cosmetic one.
 */
export function LiveBadge({ stale = false }: { stale?: boolean }) {
  const tone = stale ? 'var(--dim)' : 'var(--up)';
  return (
    <span
      className="iris-micro"
      title={stale ? 'Data is stale — the ingestion worker is not reporting' : 'Data is fresh'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: tone,
        border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
        padding: '3px 8px',
        lineHeight: 1,
      }}
    >
      <span
        className={stale ? undefined : 'iris-pulse'}
        style={{ width: 5, height: 5, borderRadius: '50%', background: tone }}
      />
      {stale ? 'STALE' : 'LIVE'}
    </span>
  );
}
