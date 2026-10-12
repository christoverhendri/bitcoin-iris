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

it('uses native 6h Coinbase granularity and rejects unsupported 4h', async () => {
  vi.mocked(fetchJson).mockResolvedValue([]);
  await getCandles('6h', 12);
  const url = new URL(vi.mocked(fetchJson).mock.calls[0][0]);
  expect(url.searchParams.get('granularity')).toBe('21600');
  await expect(getCandles('4h', 12)).rejects.toThrow('unsupported candle interval');
  expect(vi.mocked(fetchJson)).toHaveBeenCalledTimes(1);
});
