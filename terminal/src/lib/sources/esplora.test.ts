import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./http', () => ({ fetchJson: vi.fn() }));

const payload = [{ txid: 'tx1', status: { confirmed: true, block_time: 123 },
  vin: [{ prevout: { scriptpubkey_address: 'sender', value: 200000000 } }],
  vout: [{ scriptpubkey_address: 'receiver', value: 199000000 }] }];

describe('transaction sweep caching', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('shares concurrent calls and caches normalized data for five minutes', async () => {
    const { fetchJson } = await import('./http');
    vi.mocked(fetchJson).mockResolvedValue(payload);
    const { getAddressTxs } = await import('./esplora');
    const [a, b] = await Promise.all([getAddressTxs('a'), getAddressTxs('a')]);
    expect(a).toBe(b);
    expect(a[0].vin[0].valueBtc).toBe(2);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }));
    await vi.advanceTimersByTimeAsync(299999);
    await getAddressTxs('a');
    expect(fetchJson).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await getAddressTxs('a');
    expect(fetchJson).toHaveBeenCalledTimes(2);
    await getAddressTxs('b');
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });

  it('retries after failure instead of retaining a rejected promise', async () => {
    const { fetchJson } = await import('./http');
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(payload);
    const { getAddressTxs } = await import('./esplora');
    const results = await Promise.allSettled([getAddressTxs('a'), getAddressTxs('a')]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(await getAddressTxs('a')).toHaveLength(1);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('bounds the address cache', async () => {
    const { fetchJson } = await import('./http');
    vi.mocked(fetchJson).mockResolvedValue(payload);
    const { getAddressTxs } = await import('./esplora');
    for (let i = 0; i < 65; i++) await getAddressTxs(String(i));
    await getAddressTxs('64');
    expect(fetchJson).toHaveBeenCalledTimes(65);
    await getAddressTxs('0');
    expect(fetchJson).toHaveBeenCalledTimes(66);
  });
});
