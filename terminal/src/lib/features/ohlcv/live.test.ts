import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCandles as coinbase } from '@/lib/sources/coinbase';
import { getCandles as kraken } from '@/lib/sources/kraken';
import { fetchOhlcv } from './live';
import { getOhlcv } from './index';

vi.mock('@/lib/sources/coinbase', async (load) => ({ ...await load<typeof import('@/lib/sources/coinbase')>(), getCandles: vi.fn() }));
vi.mock('@/lib/sources/kraken', async (load) => ({ ...await load<typeof import('@/lib/sources/kraken')>(), getCandles: vi.fn() }));
vi.mock('@/lib/sourceStatus', () => ({ getSourceStatus: vi.fn(async () => null) }));

const bars = [{ ts: 1_700_000_000, low: 100, high: 110, open: 101, close: 109, volume: 2 }];
beforeEach(() => vi.resetAllMocks());

describe('OHLCV provider attribution and intervals', () => {
  it('attributes Kraken fallback in the actual feature envelope', async () => {
    vi.mocked(coinbase).mockRejectedValue(new Error('offline'));
    vi.mocked(kraken).mockResolvedValue(bars);
    const result = await getOhlcv({ interval: '1h', limit: 20 });
    expect(result.sourceKey).toBe('kraken');
    expect(result.isMock).toBe(false);
    expect(result.data[0].interval).toBe('1h');
    expect(kraken).toHaveBeenCalledWith('1h', 'XBTUSD');
  });

  it('retains Coinbase attribution on a same-interval long-window fallback', async () => {
    vi.mocked(kraken).mockRejectedValue(new Error('offline'));
    vi.mocked(coinbase).mockResolvedValue(bars);
    const result = await fetchOhlcv({ interval: '1d', limit: 365 });
    expect(result.sourceKey).toBe('coinbase');
    expect(result.data[0].interval).toBe('1d');
    expect(coinbase).toHaveBeenCalledWith('1d', 300, 'BTC-USD');
  });

  it('never substitutes daily candles when weekly Kraken data fails', async () => {
    vi.mocked(kraken).mockRejectedValue(new Error('offline'));
    await expect(fetchOhlcv({ interval: '1w' })).rejects.toThrow('offline');
    expect(coinbase).not.toHaveBeenCalled();
  });

  it('never substitutes daily Kraken bars for native Coinbase 6h bars', async () => {
    vi.mocked(coinbase).mockRejectedValue(new Error('offline'));
    await expect(fetchOhlcv({ interval: '6h', limit: 300 })).rejects.toThrow('offline');
    expect(kraken).not.toHaveBeenCalled();
  });

  it('uses Kraken for 4h and rejects unsupported intervals and instruments', async () => {
    vi.mocked(kraken).mockResolvedValue(bars);
    expect((await fetchOhlcv({ interval: '4h' })).sourceKey).toBe('kraken');
    expect(coinbase).not.toHaveBeenCalled();
    await expect(fetchOhlcv({ interval: '2h' })).rejects.toThrow('Unsupported');
    await expect(fetchOhlcv({ symbol: 'ETH-USD' })).rejects.toThrow('BTC-USD');
  });
});
