/**
 * Curated standing anchors. These are always merged into the events feed as
 * low-impact markers so the map is never empty, even when every RSS feed is
 * down. Coordinates point at the institution that owns the event.
 *
 * The Bitcoin halving is a protocol event with no location, so it is not listed
 * here — it would only produce a marker in the middle of the ocean.
 */
import type { EventCategory } from './classify';

export interface MacroAnchor {
  headline: string;
  category: EventCategory;
  place: string;
  lat: number;
  lon: number;
  iso2: string;
  cadence: string;
}

export const MACRO_CALENDAR: MacroAnchor[] = [
  {
    headline: 'FOMC rate decision',
    category: 'MONETARY',
    place: 'Washington DC',
    lat: 38.8951,
    lon: -77.0364,
    iso2: 'US',
    cadence: '8 meetings / year',
  },
  {
    headline: 'US CPI inflation print',
    category: 'MONETARY',
    place: 'Washington DC',
    lat: 38.8951,
    lon: -77.0364,
    iso2: 'US',
    cadence: 'monthly',
  },
  {
    headline: 'ECB rate decision',
    category: 'MONETARY',
    place: 'Frankfurt',
    lat: 50.1109,
    lon: 8.6821,
    iso2: 'DE',
    cadence: '8 meetings / year',
  },
  {
    headline: 'Bank of Japan policy meeting',
    category: 'MONETARY',
    place: 'Tokyo',
    lat: 35.6762,
    lon: 139.6503,
    iso2: 'JP',
    cadence: '8 meetings / year',
  },
  {
    headline: 'US spot Bitcoin ETF net flows',
    category: 'ETF_FUND',
    place: 'New York',
    lat: 40.7128,
    lon: -74.006,
    iso2: 'US',
    cadence: 'daily',
  },
  {
    headline: 'MiCA enforcement watch',
    category: 'REGULATION',
    place: 'Brussels',
    lat: 50.8503,
    lon: 4.3517,
    iso2: 'BE',
    cadence: 'ongoing',
  },
  {
    headline: 'China crypto policy watch',
    category: 'REGULATION',
    place: 'Beijing',
    lat: 39.9042,
    lon: 116.4074,
    iso2: 'CN',
    cadence: 'ongoing',
  },
  {
    headline: 'UK FCA crypto rules',
    category: 'REGULATION',
    place: 'London',
    lat: 51.5074,
    lon: -0.1278,
    iso2: 'GB',
    cadence: 'ongoing',
  },
  {
    headline: 'El Salvador BTC treasury update',
    category: 'ADOPTION',
    place: 'San Salvador',
    lat: 13.6929,
    lon: -89.2182,
    iso2: 'SV',
    cadence: 'ongoing',
  },
];
