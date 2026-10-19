/**
 * FRED — Federal Reserve Economic Data (St. Louis Fed).
 *
 * The one keyed source in this folder: the API needs a free key
 * (`FRED_API_KEY`), granted instantly with no approval step. Without it every
 * function here throws immediately, `defineFeature` catches that, and the macro
 * panels stay on the badged mock layer with an "unlock" note.
 *
 * Observations are monthly/quarterly, so calls use a 1-hour revalidate window.
 *
 * Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */
import { fetchJson } from './http';

const BASE = 'https://api.stlouisfed.org/fred/series/observations';

function key(): string {
  const k = process.env.FRED_API_KEY;
  if (!k) throw new Error('FRED_API_KEY not set');
  return k;
}

/**
 * FRED's server-side unit transform. `lin` = the series as published (a level for
 * price indices); `pc1` = percent change from a year ago. An inflation *rate* has
 * to be `pc1` of a price index — the raw index (~339 for US core CPI) is not one.
 */
export type FredUnits = 'lin' | 'pc1';

interface ObsResponse {
  observations: { date: string; value: string }[];
}

/**
 * The most recent `limit` observations for a series, newest-first, with FRED's
 * null marker (`value === '.'`) dropped and the rest coerced to numbers.
 */
export async function getObservations(
  seriesId: string,
  limit = 24,
  units: FredUnits = 'lin',
): Promise<{ date: string; value: number }[]> {
  const url =
    `${BASE}?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${key()}&file_type=json&sort_order=desc&limit=${limit}&units=${units}`;
  const j = await fetchJson<ObsResponse>(url, { revalidate: 3600 });
  const rows = (j?.observations ?? [])
    .filter((o) => o.value !== '.' && o.value != null)
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value));
  return rows;
}

/**
 * Latest value of a series plus its z-score over the trailing `window`
 * observations: `(latest - mean) / stdev`, with a zero-stdev guard that returns
 * `z = 0`. `asOf` is the newest observation's date.
 *
 * Throws when the key is missing or the series returns no usable observations.
 */
export async function getLatestAndZScore(
  seriesId: string,
  window = 24,
  units: FredUnits = 'lin',
): Promise<{ latest: number; z: number; asOf: string }> {
  const obs = await getObservations(seriesId, window, units);
  if (obs.length === 0) throw new Error(`fred: no observations for ${seriesId}`);

  const values = obs.map((o) => o.value);
  const latest = values[0];
  const asOf = obs[0].date;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  const z = stdev === 0 ? 0 : (latest - mean) / stdev;

  return { latest, z, asOf };
}

/** FRED release ids (identifiers of the API, not data): Consumer Price Index, Employment Situation (NFP). */
export const FRED_RELEASE = { CPI: 10, NFP: 50 } as const;

/**
 * Scheduled publication dates of a FRED release from `fromIso` on, oldest first —
 * including future dates the agency has announced (`include_release_dates_with_no_data`).
 * Docs: https://fred.stlouisfed.org/docs/api/fred/release_dates.html
 */
export async function getReleaseDates(releaseId: number, fromIso: string): Promise<string[]> {
  const url =
    `https://api.stlouisfed.org/fred/release/dates?release_id=${releaseId}&api_key=${key()}` +
    `&file_type=json&include_release_dates_with_no_data=true&sort_order=asc&realtime_start=${fromIso}&limit=50`;
  const j = await fetchJson<{ release_dates?: { date: string }[] }>(url, { revalidate: 21_600 });
  const dates = (j?.release_dates ?? []).map((d) => d.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= fromIso);
  if (dates.length === 0) throw new Error(`fred release ${releaseId}: no dates`);
  return dates;
}
