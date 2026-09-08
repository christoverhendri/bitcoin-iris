import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { StatusFooter, type FeedHealth } from './StatusFooter';

it('keeps hydration text identical even when the browser clock advances', () => {
  const now = Date.parse('2026-09-06T14:00:00Z');
  const health: FeedHealth = { observed: 1, enabled: 1, lastSyncAt: new Date(now).toISOString(),
    modelName: 'test', modelVersion: 'test', modelIsPlaceholder: true };
  vi.useFakeTimers();
  try {
    vi.setSystemTime(now);
    const server = renderToString(<StatusFooter health={health} now={now} />);
    vi.setSystemTime(now + 5000);
    expect(renderToString(<StatusFooter health={health} now={now} />)).toBe(server);
    expect(server).toContain('0s ago');
    expect(renderToString(<StatusFooter health={health} />)).not.toContain('5s ago');
  } finally { vi.useRealTimers(); }
});
