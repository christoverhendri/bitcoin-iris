import { expect, it, vi } from 'vitest';
import { getCandles } from './kraken';
import { fetchJson } from './http';
vi.mock('./http', () => ({ fetchJson: vi.fn() }));

it('rejects unsupported 6h instead of silently fetching daily candles', async () => {
  await expect(getCandles('6h')).rejects.toThrow('unsupported candle interval');
  expect(fetchJson).not.toHaveBeenCalled();
});
