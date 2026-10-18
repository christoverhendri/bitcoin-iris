import { describe, expect, it } from 'vitest';
import { toCloseDay } from './coingecko';

const sec = (iso: string) => Date.parse(iso) / 1000;

describe('toCloseDay', () => {
  it('re-dates a midnight point to the day it closes', () => {
    // CoinGecko's 2026-10-18T00:00Z point is the close of 2026-10-17.
    expect(toCloseDay(Date.parse('2026-10-18T00:00:00Z'))).toBe(sec('2026-10-17T00:00:00Z'));
  });

  it('keeps the live intraday point on today', () => {
    expect(toCloseDay(Date.parse('2026-10-18T02:30:30Z'))).toBe(sec('2026-10-18T00:00:00Z'));
  });

  it('never maps two points of one response to the same day', () => {
    const stamps = ['2026-10-16T00:00:00Z', '2026-10-17T00:00:00Z', '2026-10-18T00:00:00Z', '2026-10-18T02:30:30Z'];
    const days = stamps.map((s) => toCloseDay(Date.parse(s)));
    expect(new Set(days).size).toBe(days.length);
  });
});
