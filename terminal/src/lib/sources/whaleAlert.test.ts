import { describe, expect, it } from 'vitest';
import { normalizeWhaleTx } from './whaleAlert';

/**
 * Normalisation is the part of this source worth pinning: everything downstream
 * — the wire, the netflow cell, the stored row — reads the fields it produces.
 */

const base = {
  id: 'evt-1',
  hash: 'abc123',
  blockchain: 'bitcoin',
  symbol: 'btc',
  transaction_type: 'transfer',
  timestamp: 1_770_000_000,
  amount: 500,
  amount_usd: 50_000_000,
};

const party = (owner: string, owner_type: string) => ({ address: 'x', owner, owner_type });

describe('normalizeWhaleTx', () => {
  it('maps a wallet -> exchange transfer to a bearish inflow', () => {
    const n = normalizeWhaleTx({
      ...base,
      from: party('', 'unknown'),
      to: party('binance', 'exchange'),
    });
    expect(n?.kind).toBe('EXCHANGE_INFLOW');
    expect(n?.bias).toBe('bearish');
    expect(n?.fromLabel).toBe('Unknown wallet');
    expect(n?.toLabel).toBe('binance');
  });

  it('maps an exchange -> wallet transfer to a bullish outflow', () => {
    const n = normalizeWhaleTx({
      ...base,
      from: party('kraken', 'exchange'),
      to: party('', 'unknown'),
    });
    expect(n?.kind).toBe('EXCHANGE_OUTFLOW');
    expect(n?.bias).toBe('bullish');
  });

  it('maps exchange -> exchange to a neutral inter-exchange move', () => {
    const n = normalizeWhaleTx({
      ...base,
      from: party('okx', 'exchange'),
      to: party('bybit', 'exchange'),
    });
    expect(n?.kind).toBe('INTER_EXCHANGE');
    expect(n?.bias).toBe('neutral');
  });

  it('maps wallet -> wallet to a neutral wallet transfer', () => {
    const n = normalizeWhaleTx({
      ...base,
      from: party('', 'unknown'),
      to: party('', 'unknown'),
    });
    expect(n?.kind).toBe('WALLET_TRANSFER');
    expect(n?.bias).toBe('neutral');
  });

  it('uppercases the ticker and lowercases the chain', () => {
    const n = normalizeWhaleTx({ ...base, blockchain: 'Ethereum', symbol: 'usdt' });
    expect(n?.blockchain).toBe('ethereum');
    expect(n?.symbol).toBe('USDT');
  });

  it('builds an explorer link for a known chain and omits it for an unknown one', () => {
    expect(normalizeWhaleTx({ ...base })?.txUrl).toBe('https://blockstream.info/tx/abc123');
    expect(normalizeWhaleTx({ ...base, blockchain: 'somenewchain' })?.txUrl).toBeNull();
  });

  it('falls back to the hash when the upstream omits an id', () => {
    expect(normalizeWhaleTx({ ...base, id: undefined })?.id).toBe('abc123');
  });

  it('scores impact on a log curve between $500K and $500M', () => {
    const at = (usd: number) => normalizeWhaleTx({ ...base, amount_usd: usd })?.impact;
    expect(at(500_000)).toBe(20);
    expect(at(500_000_000)).toBe(100);
    expect(at(5_000_000_000)).toBe(100); // saturates, never exceeds
    // Monotonic, and a mid-size move is not scored as noise.
    expect(at(5_000_000)!).toBeGreaterThan(at(500_000)!);
    expect(at(50_000_000)!).toBeGreaterThan(at(5_000_000)!);
  });

  it('drops rows that cannot be ordered, scored, or keyed', () => {
    expect(normalizeWhaleTx({ ...base, transaction_type: 'mint' })).toBeNull();
    expect(normalizeWhaleTx({ ...base, timestamp: undefined })).toBeNull();
    expect(normalizeWhaleTx({ ...base, amount_usd: 0 })).toBeNull();
    expect(normalizeWhaleTx({ ...base, amount: undefined })).toBeNull();
    expect(normalizeWhaleTx({ ...base, id: undefined, hash: undefined })).toBeNull();
  });
});
