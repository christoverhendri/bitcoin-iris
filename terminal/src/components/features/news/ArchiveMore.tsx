import type { useLiveNews } from './useLiveNews';
export function ArchiveMore({ hasHistory, loadHistory, loadingHistory, historyError }: ReturnType<typeof useLiveNews>) {
  if (!hasHistory) return null;
  return <div style={{ padding: 8, color: 'var(--mut)', fontSize: 10 }}>
    <button disabled={loadingHistory} onClick={loadHistory}>{loadingHistory ? 'Loading history...' : 'Load archived headlines'}</button>
    {historyError && <span role="status"> History unavailable. Try again.</span>}
  </div>;
}
