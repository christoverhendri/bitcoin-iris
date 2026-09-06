export function NewsHistoryControl({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (!total) return null;
  return <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)', fontSize: 10, color: 'var(--mut)' }}>
    {shown < total
      ? <button type="button" onClick={onMore}>Load earlier news ({total - shown} more)</button>
      : <span>All {total} available headlines shown</span>}
  </div>;
}
