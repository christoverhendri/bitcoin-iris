/**
 * Indonesian short dates in UTC, formatted by hand so server-rendered text and
 * the browser's match exactly (no locale differences).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** `15 Okt 2026` from epoch ms or an ISO date, in UTC (same text on server and client). */
export function fmtDay(t: number | string): string {
  const d = new Date(typeof t === 'number' ? t : `${t.length === 10 ? `${t}T00:00:00Z` : t}`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `15 Okt` — for tick labels. */
export function fmtDayShort(t: number | string): string {
  const d = new Date(typeof t === 'number' ? t : `${t.length === 10 ? `${t}T00:00:00Z` : t}`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** `15 Okt 14:00 UTC` — for hourly series. */
export function fmtHour(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
}

/** `15 Okt 14:15 UTC` — for intraday candles. */
export function fmtDateTime(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
