import { describe, expect, it } from 'vitest';
import { scoreHeadline } from './lexicon';

describe('scoreHeadline', () => {
  it('does not match bearish words inside unrelated words', () => {
    expect(scoreHeadline('Bank of Japan publishes meeting minutes')).not.toBe('negative');
    expect(scoreHeadline('Software update released')).toBe('neutral');
  });

  it('retains word and phrase matches, including common forms', () => {
    expect(scoreHeadline('Bitcoin rallies after ETF inflows')).toBe('positive');
    expect(scoreHeadline('Exchange hacked after a security breach')).toBe('negative');
    expect(scoreHeadline('Bitcoin sell-off accelerates')).toBe('negative');
    expect(scoreHeadline('Bitcoin rises independently')).toBe('positive');
    expect(scoreHeadline('Analysts remain bullish')).toBe('positive');
    expect(scoreHeadline('Analysts remain bearish')).toBe('negative');
  });
});
