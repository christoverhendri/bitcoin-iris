import { describe, expect, it } from 'vitest';
import { classify } from './classify';

describe('classify', () => {
  it('does not classify substring fragments as events', () => {
    expect(classify('Bank of Japan publishes meeting minutes')).toBe('MONETARY');
    expect(classify('Bitcoin software update released')).toBe('MARKET');
  });

  it('still classifies intended whole words and phrases', () => {
    expect(classify('Government bans crypto exchange')).toBe('REGULATION');
    expect(classify('Bitcoin market hit by software war concerns')).toBe('GEOPOLITICS');
    expect(classify('Protocol hacked in security breach')).toBe('SECURITY');
    expect(classify('New sanctions target crypto exports')).toBe('GEOPOLITICS');
    expect(classify('Geopolitical tensions unsettle markets')).toBe('GEOPOLITICS');
    expect(classify('ETF inflows reach a new record')).toBe('ETF_FUND');
  });
});
