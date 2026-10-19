/**
 * FOMC meeting dates, scraped from the Federal Reserve's own calendar page —
 * no hand-kept list (IRIS_koreksi_auto_compute.md §4).
 *
 * Fail-loud like the bitbo ETF scraper: a layout the parser does not recognise
 * throws instead of returning a partial or empty list, so the calendar shows
 * "FOMC not available" rather than silently missing meetings. Parser tested
 * against a saved copy of the page (`__fixtures__/fomc-calendars.html`).
 *
 * Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 */
import { fetchText } from './http';

export const FOMC_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';

export interface FomcMeeting {
  /** Last day of the meeting = the rate-decision day (UTC date). */
  date: string;
  /** Meeting with a Summary of Economic Projections (the page's asterisk). */
  sep: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndex(name: string): number {
  const i = MONTHS.indexOf(name.trim().slice(0, 3).toLowerCase());
  if (i < 0) throw new Error(`fomc: unknown month "${name}"`);
  return i;
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Every scheduled meeting on the page, oldest first. Throws when the page does not look as expected. */
export function parseFomcCalendar(html: string): FomcMeeting[] {
  const heads = [...html.matchAll(/<h4>\s*<a[^>]*>\s*(\d{4}) FOMC Meetings\s*<\/a>\s*<\/h4>/g)];
  if (heads.length === 0) throw new Error('fomc: no "YYYY FOMC Meetings" panels found');
  const out: FomcMeeting[] = [];
  heads.forEach((h, k) => {
    const year = Number(h[1]);
    const body = html.slice(h.index!, k + 1 < heads.length ? heads[k + 1].index : undefined);
    const rows = [
      ...body.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>\s*<\/div>\s*<div class="[^"]*fomc-meeting__date[^"]*">([^<]+)<\/div>/g),
    ];
    const expected = (body.match(/fomc-meeting__date/g) ?? []).length;
    if (rows.length === 0 || rows.length !== expected) throw new Error(`fomc ${year}: parsed ${rows.length} of ${expected} meeting rows`);
    for (const [, monthText, dateText] of rows) {
      const m = dateText.trim().match(/^(\d{1,2})(?:-(\d{1,2}))?(\*)?$/);
      if (!m) continue; // "22 (notation vote)", "(unscheduled)": not a scheduled meeting
      const months = monthText.split('/');
      const startMonth = monthIndex(months[0]);
      const endMonth = months.length > 1 ? monthIndex(months[1]) : startMonth;
      const startDay = Number(m[1]);
      const endDay = m[2] ? Number(m[2]) : startDay;
      if (endDay < startDay && endMonth === startMonth) throw new Error(`fomc ${year}: "${monthText} ${dateText}" crosses a month without saying which`);
      const endYear = endMonth < startMonth ? year + 1 : year;
      out.push({ date: iso(endYear, endMonth, endDay), sep: m[3] === '*' });
    }
  });
  if (out.length === 0) throw new Error('fomc: no scheduled meetings parsed');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getFomcMeetings(): Promise<FomcMeeting[]> {
  return parseFomcCalendar(await fetchText(FOMC_URL, { revalidate: 86_400, timeoutMs: 15_000 }));
}
