import { afterEach, expect, it, vi } from 'vitest';
import { getCandles } from './coinbase';
import { fetchJson } from './http';

vi.mock('./http', () => ({ fetchJson: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('uses one candle cache key per minute and advances at the boundary', async () => {
  vi.useFakeTimers();
  vi.mocked(fetchJson).mockResolvedValue([]);
  vi.setSystemTime(new Date('2026-09-06T00:00:01Z'));
  await getCandles('1m', 100);
  vi.setSystemTime(new Date('2026-09-06T00:00:59Z'));
  await getCandles('1m', 100);
  vi.setSystemTime(new Date('2026-09-06T00:01:00Z'));
  await getCandles('1m', 100);
  const urls = vi.mocked(fetchJson).mock.calls.map(([url]) => new URL(url));
  expect(urls[0].href).toBe(urls[1].href);
  expect(Number(urls[2].searchParams.get('end')) - Number(urls[1].searchParams.get('end'))).toBe(60);
  expect(Number(urls[0].searchParams.get('end')) - Number(urls[0].searchParams.get('start'))).toBe(6000);
});
