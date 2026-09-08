import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { fetchEvents, getSourceStatus } = vi.hoisted(() => ({
  fetchEvents: vi.fn(),
  getSourceStatus: vi.fn(),
}));
vi.mock('./live', () => ({ fetchGeopoliticalEvents: fetchEvents }));
vi.mock('@/lib/sourceStatus', () => ({ getSourceStatus }));
import { getGeopoliticalEvents } from './index';

beforeEach(() => {
  fetchEvents.mockReset().mockResolvedValue(null);
  getSourceStatus.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

it('returns an empty unavailable envelope when no verified events exist', async () => {
  const result = await getGeopoliticalEvents({});
  expect(result).toMatchObject({ data: [], isMock: true, reason: 'no_rows', asOf: null });
});

it('does not manufacture events for a disabled source', async () => {
  getSourceStatus.mockResolvedValue({ is_enabled: false });
  expect(await getGeopoliticalEvents({})).toMatchObject({ data: [], reason: 'source_disabled' });
  expect(fetchEvents).not.toHaveBeenCalled();
});

it('does not manufacture events when the reader throws', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchEvents.mockRejectedValue(new Error('offline'));
  expect(await getGeopoliticalEvents({})).toMatchObject({ data: [], reason: 'query_error' });
});

it('discards synthetic rows even if a reader returns them', async () => {
  fetchEvents.mockResolvedValue({ data: [{ id: 'fabricated' }], asOf: '2026-09-07T00:00:00Z', synthetic: true });
  expect(await getGeopoliticalEvents({})).toMatchObject({ data: [], reason: 'synthetic_rows' });
});

it('preserves verified events and their source timestamp', async () => {
  const row = { data: [{ id: 'verified' }], asOf: '2026-09-07T00:00:00Z', synthetic: false };
  fetchEvents.mockResolvedValue(row);
  expect(await getGeopoliticalEvents({})).toMatchObject({ data: row.data, asOf: row.asOf, isMock: false });
});
