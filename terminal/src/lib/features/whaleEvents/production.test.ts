import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/sourceStatus', () => ({ getSourceStatus: async () => null }));
vi.mock('./live', () => ({ fetchWhaleEvents: async () => ({ data: [{ id: 'synthetic' }], synthetic: true, asOf: '2026-09-06T00:00:00Z' }) }));
import { getWhaleEvents } from './index';
afterEach(() => vi.unstubAllEnvs());
it('strips synthetic database rows from the production API', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const result = await getWhaleEvents({ limit: 50 });
  expect(result.isMock).toBe(true);
  expect(result.data).toEqual([]);
});
