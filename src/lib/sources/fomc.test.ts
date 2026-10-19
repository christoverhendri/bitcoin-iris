import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFomcCalendar } from './fomc';

/** Saved copy of federalreserve.gov/monetarypolicy/fomccalendars.htm (2026-10-19). */
const HTML = readFileSync(join(__dirname, '__fixtures__', 'fomc-calendars.html'), 'utf8');

describe('parseFomcCalendar', () => {
  const meetings = parseFomcCalendar(HTML);

  it('reads every 2026 decision day, with the projection (SEP) meetings marked', () => {
    expect(meetings.filter((m) => m.date.startsWith('2026'))).toEqual([
      { date: '2026-01-28', sep: false },
      { date: '2026-03-18', sep: true },
      { date: '2026-04-29', sep: false },
      { date: '2026-06-17', sep: true },
      { date: '2026-07-29', sep: false },
      { date: '2026-09-16', sep: true },
      { date: '2026-10-28', sep: false },
      { date: '2026-12-09', sep: true },
    ]);
  });

  it('handles a meeting across two months and skips notation votes', () => {
    expect(meetings.find((m) => m.date === '2024-05-01')).toBeDefined(); // "Apr/May 30-1"
    expect(meetings.some((m) => m.date === '2025-08-22')).toBe(false); // "22 (notation vote)"
    expect(meetings.filter((m) => m.date.startsWith('2025'))).toHaveLength(8);
  });

  it('is sorted and includes the next year already published', () => {
    expect(meetings.map((m) => m.date)).toEqual([...meetings.map((m) => m.date)].sort());
    expect(meetings.some((m) => m.date.startsWith('2027'))).toBe(true);
  });

  it('fails loudly on a page it does not recognise', () => {
    expect(() => parseFomcCalendar('<html><body>maintenance</body></html>')).toThrow();
    const broken = HTML.replace(/<strong>March<\/strong>/, '<em>March</em>');
    expect(() => parseFomcCalendar(broken)).toThrow(/parsed \d+ of \d+/);
  });
});
