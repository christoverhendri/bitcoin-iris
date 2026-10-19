import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sources/fomc', () => ({ getFomcMeetings: vi.fn() }));
vi.mock('@/lib/sources/fred', () => ({ FRED_RELEASE: { CPI: 10, NFP: 50 }, getReleaseDates: vi.fn() }));

const { getFomcMeetings } = await import('@/lib/sources/fomc');
const { getReleaseDates } = await import('@/lib/sources/fred');
const { fetchMacroCalendar } = await import('./live');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(getFomcMeetings).mockReset();
  vi.mocked(getReleaseDates).mockReset();
});

describe('fetchMacroCalendar', () => {
  it('merges FOMC, CPI and NFP, soonest first; the last past release dates it', async () => {
    vi.mocked(getFomcMeetings).mockResolvedValue([{ date: '2026-09-16', sep: true }, { date: '2026-10-28', sep: false }]);
    vi.mocked(getReleaseDates).mockImplementation(async (id: number) => (id === 10 ? ['2026-10-14', '2026-11-10'] : ['2026-10-02', '2026-11-06']));
    const r = await fetchMacroCalendar({});
    expect(r!.data.upcoming.map((e) => `${e.kind} ${e.date}`)).toEqual(['FOMC 2026-10-28', 'NFP 2026-11-06', 'CPI 2026-11-10']);
    expect(r!.data.missing).toEqual([]);
    expect(r!.asOf).toBe('2026-10-14T00:00:00Z');
  });

  it('a failing source is named, not filled in', async () => {
    vi.mocked(getFomcMeetings).mockRejectedValue(new Error('layout changed'));
    vi.mocked(getReleaseDates).mockResolvedValue(['2026-11-10']);
    const r = await fetchMacroCalendar({});
    expect(r!.data.missing).toEqual(['FOMC']);
    expect(r!.data.upcoming.every((e) => e.kind !== 'FOMC')).toBe(true);
  });

  it('every source failing hides the panel', async () => {
    vi.mocked(getFomcMeetings).mockRejectedValue(new Error('x'));
    vi.mocked(getReleaseDates).mockRejectedValue(new Error('x'));
    expect(await fetchMacroCalendar({})).toBeNull();
  });
});
