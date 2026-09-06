import { describe, expect, it } from 'vitest';
import { commandsFor, filterCommands, timeframeHref } from './commands';

describe('terminal commands', () => {
  it('finds deep-linked pages using multiple search terms', () => {
    expect(filterCommands(commandsFor('/overview'), ' FORECAST monthly ')).toEqual([
      expect.objectContaining({ href: '/forecast/monthly' }),
    ]);
  });
  it('only offers timeframes on pages that consume them', () => {
    expect(commandsFor('/market/price').filter((c) => 'timeframe' in c)).toHaveLength(6);
    expect(commandsFor('/sentiment').filter((c) => 'timeframe' in c)).toHaveLength(0);
  });
  it('preserves unrelated URL state when changing a timeframe', () => {
    expect(timeframeHref('/market/price', '?tf=1Y&indicator=rsi', '7D')).toBe('/market/price?tf=7D&indicator=rsi');
  });
  it('handles empty and unmatched searches', () => {
    const commands = commandsFor('/overview');
    expect(filterCommands(commands, '')).toHaveLength(commands.length);
    expect(filterCommands(commands, 'unknown command')).toEqual([]);
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });
});
