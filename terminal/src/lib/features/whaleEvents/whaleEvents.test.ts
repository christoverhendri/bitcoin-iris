import { describe, expect, it } from 'vitest';
import { mockWhaleEvents } from './mock';
import { summarizeWhaleFlow, netflowWord, netflowColor, fmtAmount } from './present';
import type { WhaleEvent } from './types';

const event = (over: Partial<WhaleEvent>): WhaleEvent => ({
  id: 'e',
  ts: '2026-09-03T12:00:00.000Z',
  blockchain: 'bitcoin',
  symbol: 'BTC',
  amount: 100,
  amountUsd: 10_000_000,
  fromLabel: 'a',
  toLabel: 'b',
  kind: 'WALLET_TRANSFER',
  bias: 'neutral',
  impact: 50,
  txUrl: null,
  ...over,
});

describe('mockWhaleEvents', () => {
  it('is deterministic for the same args', () => {
    // The panel is a client component: if this drifts, SSR and hydration
    // disagree and React throws.
    expect(mockWhaleEvents({ limit: 50 })).toEqual(mockWhaleEvents({ limit: 50 }));
  });

  it('honours the limit and stays sorted newest first', () => {
    const events = mockWhaleEvents({ limit: 5 });
    expect(events.length).toBeLessThanOrEqual(5);
    const times = events.map((e) => Date.parse(e.ts));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('never fabricates an explorer link', () => {
    // A made-up hash would 404 on a real explorer.
    expect(mockWhaleEvents({ limit: 50 }).every((e) => e.txUrl === null)).toBe(true);
  });
});

describe('summarizeWhaleFlow', () => {
  it('nets inflow against outflow and ignores non-directional kinds', () => {
    const s = summarizeWhaleFlow([
      event({ id: '1', kind: 'EXCHANGE_INFLOW', amountUsd: 30_000_000 }),
      event({ id: '2', kind: 'EXCHANGE_OUTFLOW', amountUsd: 10_000_000 }),
      event({ id: '3', kind: 'INTER_EXCHANGE', amountUsd: 99_000_000 }),
      event({ id: '4', kind: 'WALLET_TRANSFER', amountUsd: 99_000_000 }),
    ]);
    expect(s.inflowUsd).toBe(30_000_000);
    expect(s.outflowUsd).toBe(10_000_000);
    expect(s.netUsd).toBe(20_000_000);
    expect(s.count).toBe(4);
    expect(s.inflowCount).toBe(1);
  });

  it('windows from the newest event, not the wall clock', () => {
    // Both events are far in the past. A wall-clock window would return zero;
    // the honest reading is "24h of what we actually saw".
    const s = summarizeWhaleFlow([
      event({ id: '1', ts: '2020-01-02T00:00:00.000Z', kind: 'EXCHANGE_INFLOW' }),
      event({ id: '2', ts: '2020-01-01T00:00:00.000Z', kind: 'EXCHANGE_INFLOW' }),
      event({ id: '3', ts: '2019-01-01T00:00:00.000Z', kind: 'EXCHANGE_INFLOW' }),
    ]);
    expect(s.count).toBe(2);
  });

  it('returns zeroes for an empty feed', () => {
    expect(summarizeWhaleFlow([])).toEqual({
      inflowUsd: 0,
      outflowUsd: 0,
      netUsd: 0,
      inflowCount: 0,
      outflowCount: 0,
      count: 0,
    });
  });
});

describe('netflow presentation', () => {
  it('treats net inflow as bearish — supply arriving at the order book', () => {
    expect(netflowWord(1)).toBe('NET INFLOW');
    expect(netflowColor(1)).toBe('var(--down)');
    expect(netflowColor(-1)).toBe('var(--up)');
    expect(netflowColor(0)).toBe('var(--mut)');
  });
});

describe('fmtAmount', () => {
  it('labels the asset rather than implying dollars', () => {
    expect(fmtAmount(event({ amount: 24_000_000, symbol: 'USDT' }))).toBe('24.00M USDT');
    expect(fmtAmount(event({ amount: 0.5, symbol: 'BTC' }))).toBe('0.50 BTC');
  });
});
